import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { arconisUsers, managementFromEnvironment } from "./auth0Management";
import { runMaintenance } from "./maintenance";

const alarmTopic = process.env.ALARM_TOPIC_ARN ?? "";
const management = managementFromEnvironment(process.env);
const cloudwatch = new CloudWatchClient({});
const sns = new SNSClient({});

export async function handler() {
  return runMaintenance({
    now: Date.now,
    users: () => management.users(arconisUsers()),
    deleteUser: (id) => management.deleteUser(id),
    publish: async ({ activated, created }) => {
      await cloudwatch.send(
        new PutMetricDataCommand({
          Namespace: "Arconis/Accounts",
          MetricData: [
            { MetricName: "ActivatedAccounts", Value: activated, Unit: "Count" },
            { MetricName: "AccountsCreatedPerDay", Value: created, Unit: "Count" },
          ],
        })
      );
    },
    alert: async (Subject, Message) => {
      await sns.send(new PublishCommand({ TopicArn: alarmTopic, Subject, Message }));
    },
  });
}
