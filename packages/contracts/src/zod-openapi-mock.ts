import { z } from 'zod';

export function extendZodWithOpenApi(zod: typeof z) {
  if (!(zod.ZodType.prototype as any).openapi) {
    (zod.ZodType.prototype as any).openapi = function() {
      return this;
    };
  }
}

export class OpenAPIRegistry {
  definitions: any[] = [];
  registerComponent(_type: any, name: any, _component: any) {
    return { name };
  }
  registerPath(_path: any) {}
  register(_name: any, _schema: any) {}
  registerParameter(_name: any, _schema: any) {}
  registerWebhook(_webhook: any) {}
}

export class OpenApiGeneratorV31 {
  constructor(_definitions: any) {}
  generateDocument(_config: any) {
    return { openapi: '3.1.0', info: { title: 'Employee Onboarding', version: '0.1.0' }, paths: {} };
  }
}
