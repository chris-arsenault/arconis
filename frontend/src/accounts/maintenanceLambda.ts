import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { runMaintenance } from "./maintenance";

const poolId = process.env.USER_POOL_ID ?? "";
const alarmTopic = process.env.ALARM_TOPIC_ARN ?? "";
const cognito = new CognitoIdentityProviderClient({});
const cloudwatch = new CloudWatchClient({});
const sns = new SNSClient({});

async function* users() {
  let PaginationToken: string | undefined;
  do {
    const page = await cognito.send(new ListUsersCommand({ UserPoolId: poolId, PaginationToken }));
    for (const user of page.Users ?? [])
      yield {
        username: user.Username ?? "",
        status: user.UserStatus ?? "",
        created: user.UserCreateDate?.getTime() ?? 0,
      };
    PaginationToken = page.PaginationToken;
  } while (PaginationToken);
}

export async function handler() {
  return runMaintenance({
    now: Date.now,
    users,
    deleteUser: async (Username) => {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username }));
    },
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
