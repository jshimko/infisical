import { faEllipsisV, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useOidcManageGroupMembershipsEnabled } from "@app/hooks/api";
import { TGroupUser } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  user: TGroupUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupMembershipRow = ({
  user: { firstName, lastName, username, joinedGroupAt, email, id },
  handlePopUpOpen
}: Props) => {
  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td>
        <p>{`${firstName ?? "-"} ${lastName ?? ""}`}</p>
      </Td>
      <Td>
        <p>{email}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p>{new Date(joinedGroupAt).toLocaleDateString()}</p>
        </Tooltip>
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => {
                  return (
                    <Tooltip
                      content={
                        isOidcManageGroupMembershipsEnabled
                          ? "OIDC Group Membership Mapping Enabled. Remove user from this group in your OIDC provider."
                          : undefined
                      }
                      position="left"
                    >
                      <div>
                        <DropdownMenuItem
                          icon={<FontAwesomeIcon icon={faUserMinus} />}
                          onClick={() => handlePopUpOpen("removeMemberFromGroup", { username })}
                          isDisabled={!isAllowed || isOidcManageGroupMembershipsEnabled}
                        >
                          Remove User From Group
                        </DropdownMenuItem>
                      </div>
                    </Tooltip>
                  );
                }}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
