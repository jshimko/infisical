/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'

import { Tab, TabList, TabPanel, Tabs } from '@app/components/v2'
import { OrgPermissionActions, OrgPermissionSubjects } from '@app/context'
import { withPermission } from '@app/hoc'
import { TabSections } from '@app/types/org'

import {
  OrgGroupsTab,
  OrgIdentityTab,
  OrgMembersTab,
  OrgRoleTabSection,
} from './-components'

export const MembersSection = withPermission(
  () => {
    const navigate = useNavigate({
      from: '/_authenticate/_org_details/_org-layout/organization/$organizationId/members',
    })
    const search = useSearch({
      from: '/_authenticate/_org_details/_org-layout/organization/$organizationId/members',
    })
    const selectedTab = search.selectedTab as TabSections
    const [activeTab, setActiveTab] = useState<TabSections>(TabSections.Member)

    useEffect(() => {
      if (
        selectedTab &&
        Object.values(TabSections).includes(selectedTab as TabSections)
      ) {
        setActiveTab(selectedTab)
      }
    }, [selectedTab])

    const updateSelectedTab = (tab: string) => {
      navigate({
        search: { ...search, selectedTab: tab },
      })
    }

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
          <p className="mb-4 mr-4 text-3xl font-semibold text-white">
            Organization Access Control
          </p>
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={TabSections.Member}>Users</Tab>
              <Tab value={TabSections.Groups}>Groups</Tab>
              <Tab value={TabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              <Tab value={TabSections.Roles}>Organization Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <OrgMembersTab />
            </TabPanel>
            <TabPanel value={TabSections.Groups}>
              <OrgGroupsTab />
            </TabPanel>
            <TabPanel value={TabSections.Identities}>
              <OrgIdentityTab />
            </TabPanel>
            <TabPanel value={TabSections.Roles}>
              <OrgRoleTabSection />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    )
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member },
)

const MembersPage = () => {
  const { t } = useTranslation()

  return (
    <>
      <Helmet>
        <title>
          {t('common.head-title', { title: t('settings.org.title') })}
        </title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <MembersSection />
    </>
  )
}

export const Route = createFileRoute(
  '/_authenticate/_org_details/_org-layout/organization/$organizationId/members/',
)({
  component: MembersPage,
})
