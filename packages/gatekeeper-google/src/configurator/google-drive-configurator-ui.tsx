import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  GoogleDriveConfiguratorRpc, GoogleDriveConfiguratorValues,
} from "./google-drive-configurator-types";

export default {
  initial: {},

  isReady() {
    return true;
  },

  resourceUrl() {
    return "https://drive.google.com/drive/my-drive";
  },

  render() {
    return <Section>
      <Field
        label="Whole Drive access"
        description="This read-only binding can list, search, and download every file visible to the connected Google account, including files in shared drives.">
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<GoogleDriveConfiguratorRpc, GoogleDriveConfiguratorValues>;
