/**
 * The owner's reference architecture: a multi-region AWS design with nested frames, cross-frame
 * alignment, bands across regions, shared styles and labelled lines. Tests and agent trials hold the
 * language to it.
 */
export const REFERENCE_DIAGRAM = `
style aws line #232f3e badge lucide:Cloud title top fill none
style region line #00a1c9 dashed title top badge lucide:Flag text-color #00a1c9 fill none
style layer line #d5dbdb fill none title side
style proxy line #e7a33e dashed title top text-size 10 fill none
style replication fill #e6f6f7
style record line #000000 line-width 2 title top badge lucide:Cloud

frame sor "Systems of Record" record at 0,100 column gap 40 {
  node fs "File Systems" / "AWS Storage Gateway" icon aws:AWS-Storage-Gateway
  node dms "DB CDC Events" / "AWS DMS" icon aws:AWS-Database-Migration-Service
}
node users "Users" icon lucide:Users below sor gap 80

frame cloud aws right of sor gap 120 {
  row edge gap 100 middle with users {
    node cdn "Path-based Routing" / "Amazon CloudFront" icon aws:Amazon-CloudFront
    node r53 "Latency Routing" / "Amazon Route 53" icon aws:Amazon-Route-53
  }
  frame r1 "Region" region right of edge gap 140 top with sor {
    node s3in "Ingestion" / "Amazon S3" icon aws:Amazon-Simple-Storage-Service
    node kin "CDC Event Stream" / "Amazon Kinesis" icon aws:Amazon-Kinesis below s3in gap 60 nudge -100,0
    node api1 "REST/SOAP" / "Amazon API Gateway" icon aws:Amazon-API-Gateway below kin gap 80 middle with users
    node q1 "Query" icon aws:AWS-Lambda right of api1 gap 60
    column stack gap 40 right of s3in gap 220 top with s3in {
      card bus "Event Bus" / "Amazon EventBridge" icon aws:Amazon-EventBridge width 520
      frame logic "Logic Layer" layer row gap 50 {
        node fn "Serverless Microservices" / "AWS Lambda" icon aws:AWS-Lambda
        node ecs "Long Running Containers" / "AWS Fargate" icon aws:AWS-Fargate
        node saga "Saga Pattern" / "AWS Step Functions" icon aws:AWS-Step-Functions
        node ml "Machine Learning" / "Amazon A2I" icon aws:Amazon-Augmented-AI-A2I
      }
      frame data "Data Layer" layer row gap 40 {
        frame dax "DAX" proxy { node ddb1 "Single View" / "Amazon DynamoDB" icon aws:Amazon-DynamoDB }
        frame rdsp "RDS Proxy" proxy { node rds1 "Report DB" / "Amazon Aurora" icon aws:Amazon-Aurora }
        frame s3ap "S3 Access Points" proxy { node lake1 "Data Lake" / "Amazon S3 Lake Formation" icon aws:Amazon-Simple-Storage-Service }
      }
    }
  }
  frame r2 "Region" region below r1 gap 30 width of r1 {
    node api2 "REST/SOAP" / "Amazon API Gateway" icon aws:Amazon-API-Gateway center with api1 below api1 gap 220
    node q2 "Query" icon aws:AWS-Lambda right of api2 gap 60
    node ddb2 "Global Tables" / "Amazon DynamoDB" icon aws:Amazon-DynamoDB below ddb1 gap 230
    node rds2 "Global Database" / "Amazon Aurora" icon aws:Amazon-Aurora below rds1 gap 230
    node lake2 "S3 CRR" / "Amazon S3 Lake Formation" icon aws:Amazon-Simple-Storage-Service below lake1 gap 230
  }
}
band rep1 "Cross-Region Replication" replication over dax, ddb2
band rep2 "Cross-Region Replication" replication over rdsp, rds2
band rep3 "Cross-Region Replication" replication over s3ap, lake2
node sor2 "Systems of Record" icon lucide:Cloud above cloud gap 40 right with cloud
text events "Data Events" vertical right of data gap 40

fs -> s3in "File System Changes"
dms -> kin "Database Changes"
kin.right -> s3in.bottom
s3in -> bus
users -> cdn -> r53 -> api1
r53.bottom -> api2
api1 -> q1 -> data
api1 -> bus "Async Write", logic "Sync Write" shared around
api2.top -> api1.bottom "CQRS Write"
api2 -> q2 -> rep1
logic.bottom -> data.top
logic.top <-> sor2 "Write" around
logic.right -> bus.right "Logic Events" vertical
sor.top -> cloud.top "Application Events" around
`;
