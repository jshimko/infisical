import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { BillingCloudTab } from "../BillingCloudTab";
import { BillingDetailsTab } from "../BillingDetailsTab";
import { BillingReceiptsTab } from "../BillingReceiptsTab";
import { BillingSelfHostedTab } from "../BillingSelfHostedTab";

const tabs = [
  { name: "Infisical Cloud", key: "tab-infisical-cloud" },
  { name: "Infisical Self-Hosted", key: "tab-infisical-self-hosted" },
  { name: "Receipts", key: "tab-receipts" },
  { name: "Billing details", key: "tab-billing-details" }
];

export const BillingTabGroup = withPermission(
  () => {
    const isCloudInstance =
      window.location.origin.includes("https://app.infisical.com") ||
      window.location.origin.includes("https://eu.infisical.com") ||
      window.location.origin.includes("https://gamma.infisical.com");

    const tabsFiltered = isCloudInstance
      ? tabs
      : [{ name: "Infisical Self-Hosted", key: "tab-infisical-cloud" }];

    return (
      <Tabs defaultValue={tabs[0].key}>
        <TabList>
          {tabsFiltered.map((tab) => (
            <Tab value={tab.key}>{tab.name}</Tab>
          ))}
        </TabList>
        <TabPanel value={tabs[0].key}>
          <BillingCloudTab />
        </TabPanel>
        {isCloudInstance && (
          <>
            <TabPanel value={tabs[1].key}>
              <BillingSelfHostedTab />
            </TabPanel>
            <TabPanel value={tabs[2].key}>
              <BillingReceiptsTab />
            </TabPanel>
            <TabPanel value={tabs[3].key}>
              <BillingDetailsTab />
            </TabPanel>
          </>
        )}
      </Tabs>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Billing }
);
