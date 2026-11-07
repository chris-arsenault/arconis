import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
} from "@aws-sdk/client-auto-scaling";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { RelayControl, capacityState } from "./control";

// The ALB-facing Lambda: POST /control/start and GET /control/status. Usage comes from CloudWatch's
// metrics for the Auto Scaling group, which outlive any instance, and nothing a client or the relay
// reports can change them.
const groupName = process.env.GROUP_NAME ?? "";
const siteOrigin = process.env.SITE_ORIGIN ?? "";
const overrideParameter = process.env.OVERRIDE_PARAMETER ?? "";
const alertParameter = process.env.ALERT_PARAMETER ?? "";
const alarmTopic = process.env.ALARM_TOPIC_ARN ?? "";

const FIVE_MINUTES = 300;
const BYTES_PER_GB = 1024 ** 3;

const autoscaling = new AutoScalingClient({});
const setCapacity = async (DesiredCapacity: number) => {
  await autoscaling.send(
    new SetDesiredCapacityCommand({ AutoScalingGroupName: groupName, DesiredCapacity })
  );
};
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
        Dimensions: [{ Name: "AutoScalingGroupName", Value: groupName }],
      },
      Period: FIVE_MINUTES,
      Stat: stat,
    },
  };
}

const control = new RelayControl({
  now: () => new Date(),
  instanceState: async () => {
    const reply = await autoscaling.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [groupName] })
    );
    const group = reply.AutoScalingGroups?.[0];
    const lifecycles = (group?.Instances ?? []).map((instance) => instance.LifecycleState ?? "");
    return capacityState(group?.DesiredCapacity ?? 0, lifecycles);
  },
  startInstance: () => setCapacity(1),
  stopInstance: () => setCapacity(0),
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
    // Each five-minute period with any data counts as one instance's whole period. That rounds a
    // short session up, and undercounts only the minutes two instances overlap during a rollout.
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
