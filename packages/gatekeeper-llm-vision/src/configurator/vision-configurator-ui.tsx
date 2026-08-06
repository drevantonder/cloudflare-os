import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { VisionConfiguratorRpc, VisionConfiguratorValues } from "./vision-configurator-types";

export default {
  initial: {},

  isReady() {
    return true;
  },

  resourceUrl() {
    return "vision://analyze";
  },

  render() {
    return <Section>
      <Field
        label="LLM Vision"
        description="Analyze images and PDFs attached by this workspace.">
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<VisionConfiguratorRpc, VisionConfiguratorValues>;
