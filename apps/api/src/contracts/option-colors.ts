import { OPTION_COLORS, type OptionColor } from "@cheddar/contracts";
import { registerDecorator } from "class-validator";

export const COLORS_SCHEMA = {
  type: "object",
  additionalProperties: { type: "string", enum: [...OPTION_COLORS] },
} satisfies import("@nestjs/swagger").ApiPropertyOptions;
export function IsOptionColors(): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: "isOptionColors",
      target: target.constructor,
      propertyName: String(propertyName),
      validator: {
        validate: (value: unknown) =>
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.values(value).every((color) =>
            OPTION_COLORS.includes(color as OptionColor),
          ),
      },
    });
}
export function optionColors(
  options: readonly string[],
  colors: Record<string, OptionColor> = {},
): Record<string, OptionColor> {
  return Object.fromEntries(
    Object.entries(colors).filter(([name]) => options.includes(name)),
  );
}
