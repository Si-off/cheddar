import { ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import { invalid } from "./errors";

function fields(
  errors: ValidationError[],
  prefix = "",
): { field: string; code: string }[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...Object.keys(error.constraints ?? {}).map((code) => ({ field, code })),
      ...fields(error.children ?? [], field),
    ];
  });
}
export function validationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => invalid(fields(errors)),
  });
}
