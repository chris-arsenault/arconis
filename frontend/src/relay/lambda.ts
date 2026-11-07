import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from "@aws-sdk/client-ec2";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { RelayControl, type InstanceState } from "./control";

// The ALB-facing Lambda: POST /control/start and GET /control/status. Usage comes from the
// instance's CloudWatch metrics, so nothing a client or the relay reports can change it.
const instanceId = process.env.INSTANCE_ID ?? "";
const siteOrigin = process.env.SITE_ORIGIN ?? "";
const overrideParameter = process.env.OVERRIDE_PARAMETER ?? "";
const alertParameter = process.env.ALERT_PARAMETER ?? "";
const alarmTopic = process.env.ALARM_TOPIC_ARN ?? "";

const FIVE_MINUTES = 300;
const BYTES_PER_GB = 1024 ** 3;

const ec2 = new EC2Client({});
const cloudwatch = new CloudWatchClient({});
const ssm = new SSMClient({});
const sns = new SNSClient({});

const readParameter = async (name: string) =>
  (await ssm.send(new GetParameterCommand({ Name: name }))).Parameter?.Value ?? "";

function metric(id: string, name: string, stat: string) {
  return {
    Id: id,
    MetricStat: {
      Metric: {
        Namespace: "AWS/EC2",
        MetricName: name,
        Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      },
      Period: FIVE_MINUTES,
      Stat: stat,
    },
  };
}

const control = new RelayControl({
  now: () => new Date(),
  instanceState: async () => {
    const reply = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    return reply.Reservations?.[0]?.Instances?.[0]?.State?.Name as InstanceState;
  },
  startInstance: async () => {
    await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
  },
  stopInstance: async () => {
    await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
  },
  usage: async (from, to) => {
    const reply = await cloudwatch.send(
      new GetMetricDataCommand({
        StartTime: from,
        EndTime: to,
        MetricDataQueries: [
          metric("cpu", "CPUUtilization", "SampleCount"),
          metric("out", "NetworkOut", "Sum"),
        ],
      })
    );
    const series = (id: string) => reply.MetricDataResults?.find((r) => r.Id === id)?.Values ?? [];
    // Each five-minute period with any data counts whole, which rounds running time up.
    return {
      hours: (series("cpu").length * FIVE_MINUTES) / 3600,
      gigabytes: series("out").reduce((sum, bytes) => sum + bytes, 0) / BYTES_PER_GB,
    };
  },
  override: () => readParameter(overrideParameter),
  lastAlert: () => readParameter(alertParameter),
  recordAlert: async (value) => {
    await ssm.send(
      new PutParameterCommand({
        Name: alertParameter,
        Value: value,
        Type: "String",
        Overwrite: true,
      })
    );
  },
  alert: async (subject, message) => {
    await sns.send(
      new PublishCommand({ TopicArn: alarmTopic, Subject: subject, Message: message })
    );
  },
});

interface AlbEvent {
  path: string;
  httpMethod: string;
}

function reply(statusCode: number, body: object) {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: { "content-type": "application/json", "access-control-allow-origin": siteOrigin },
    body: JSON.stringify(body),
  };
}

export async function handler(event: AlbEvent) {
  try {
    if (event.httpMethod === "POST" && event.path === "/control/start")
      return reply(200, { status: await control.start() });
    if (event.httpMethod === "GET" && event.path === "/control/status")
      return reply(200, { status: await control.status() });
    return reply(404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return reply(500, { error: "The relay control request failed." });
  }
}
