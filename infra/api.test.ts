import * as cdk from "aws-cdk-lib";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import { ApiStack } from "./stack.js";
const fixture = {
  PLATFORM_ACCOUNT: "111111111111",
  PLATFORM_REGION: "us-east-1",
  PLATFORM_ENV: "demo",
  PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1b",
  PLATFORM_SITE_ORIGIN: "https://wander.example",
  API_IMAGE_TAG: "1111111111111111111111111111111111111111",
};
function template(extra: Record<string, string> = {}) {
  return cdk.assertions.Template.fromStack(
    new ApiStack(new cdk.App(), "Api", parseConfig({ ...fixture, ...extra }))
  );
}
describe("rest Fargate contract", () => {
  it("requires bounded live inputs and immutable image revisions", () => {
    expect(() => parseConfig({ ...fixture, API_IMAGE_TAG: "latest" })).toThrow("API_IMAGE_TAG");
    expect(() =>
      parseConfig({ ...fixture, PLATFORM_SITE_ORIGIN: "http://wander.example" })
    ).toThrow("PLATFORM_SITE_ORIGIN");
    expect(() =>
      parseConfig({ ...fixture, PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1a" })
    ).toThrow("PLATFORM_AVAILABILITY_ZONES");
  });
  it("uses private tasks, foundation roles, live auth and healthy ALB targets", () => {
    const t = template();
    t.resourceCountIs("AWS::IAM::Role", 0);
    t.resourceCountIs("AWS::IAM::Policy", 0);
    t.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 1,
      NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: "DISABLED" } },
      DeploymentConfiguration: { MinimumHealthyPercent: 100, MaximumPercent: 200 },
    });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      Port: 3000,
      TargetType: "ip",
      HealthCheckPath: "/health",
    });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", { Priority: 10 });
    t.resourceCountIs("AWS::CloudWatch::Alarm", 1);
    const task = Object.values(t.findResources("AWS::ECS::TaskDefinition"))[0];
    const container = task.Properties.ContainerDefinitions[0];
    expect(container.Environment).toContainEqual({ Name: "APP_MODE", Value: "live" });
    expect(container.HealthCheck.Command.join(" ")).toContain("/health");
    const text = JSON.stringify(t.toJSON());
    expect(text).toContain("roles/rest-task-arn");
    expect(text).toContain("roles/rest-execution-arn");
    expect(text).toContain("compute/rest-listener-arn");
    expect(text).not.toContain("ssm:GetParameter");
    expect(text).not.toContain("AWS::Lambda");
    expect(container.Environment).toContainEqual({ Name: "PROVIDER_STORE", Value: "dynamo" });
    expect(text).not.toContain("secretsmanager");
  });
});
