import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  Custom = "custom"
}

const PERMISSION_ACTIONS = [{ action: "manage-settings", label: "Manage settings" }] as const;

export const OrgPermissionSecretShareRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.secret-share"
  });

  const selectedPermissionCategory = useMemo(() => {
    if (rule?.["manage-settings"]) {
      return Permission.Custom;
    }
    return Permission.NoAccess;
  }, [rule, isCustom]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

  useEffect(() => {
    const isRowCustom = selectedPermissionCategory === Permission.Custom;
    if (isRowCustom) {
      setIsRowExpanded.on();
    }
  }, []);

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    if (val === Permission.Custom) {
      setIsRowExpanded.on();
      setIsCustom.on();
      return;
    }
    setIsCustom.off();

    if (val === Permission.NoAccess) {
      setValue("permissions.secret-share", { "manage-settings": false }, { shouldDirty: true });
    }
  };

  return (
    <>
      <Tr
        className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>
          <FontAwesomeIcon icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td>Secret Share</Td>
        <Td>
          <Select
            value={selectedPermissionCategory}
            className="w-40 bg-mineshaft-600"
            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
            onValueChange={handlePermissionChange}
            isDisabled={!isEditable}
          >
            <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
            <SelectItem value={Permission.Custom}>Custom</SelectItem>
          </Select>
        </Td>
      </Tr>
      {isRowExpanded && (
        <Tr>
          <Td
            colSpan={3}
            className={`bg-bunker-600 px-0 py-0 ${isRowExpanded && "border-mineshaft-500 p-8"}`}
          >
            <div className="grid grid-cols-3 gap-4">
              {PERMISSION_ACTIONS.map(({ action, label }) => {
                return (
                  <Controller
                    name={`permissions.secret-share.${action}`}
                    key={`permissions.secret-share.${action}`}
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        isChecked={field.value}
                        onCheckedChange={(e) => {
                          if (!isEditable) {
                            createNotification({
                              type: "error",
                              text: "Failed to update default role"
                            });
                            return;
                          }
                          field.onChange(e);
                        }}
                        id={`permissions.secret-share.${action}`}
                      >
                        {label}
                      </Checkbox>
                    )}
                  />
                );
              })}
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
