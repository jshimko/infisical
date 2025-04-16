import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { faInfoCircle, faPlus, faTrash, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import {
  PermissionConditionOperators,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import {
  getConditionOperatorHelperInfo,
  renderOperatorSelectItems
} from "./PermissionConditionHelpers";
import { TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const DynamicSecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors }
  } = useFormContext<TFormSchema>();
  const items = useFieldArray({
    control,
    name: `permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions`
  });

  const conditionErrorMessage =
    errors?.permissions?.[ProjectPermissionSub.DynamicSecrets]?.[position]?.conditions?.message ||
    errors?.permissions?.[ProjectPermissionSub.DynamicSecrets]?.[position]?.conditions?.root
      ?.message;

  return (
    <div className="mt-6 border-t border-t-mineshaft-600 bg-mineshaft-800 pt-2">
      <p className="mt-2 text-gray-300">Conditions</p>
      <p className="text-sm text-mineshaft-400">
        Conditions determine when a policy will be applied (always if no conditions are present).
      </p>
      <p className="mb-3 text-sm leading-4 text-mineshaft-400">
        All conditions must evaluate to true for the policy to take effect.
      </p>
      <div className="mt-2 flex flex-col space-y-2">
        {items.fields.map((el, index) => {
          const condition = watch(
            `permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions.${index}`
          ) as {
            lhs: string;
            rhs: string;
            operator: string;
          };
          return (
            <div
              key={el.id}
              className="flex gap-2 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md"
            >
              <div className="w-1/4">
                <Controller
                  control={control}
                  name={`permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions.${index}.lhs`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => {
                          setValue(
                            `permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions.${index}.operator`,
                            PermissionConditionOperators.$IN as never
                          );
                          field.onChange(e);
                        }}
                        className="w-full"
                      >
                        <SelectItem value="environment">Environment Slug</SelectItem>
                        <SelectItem value="secretPath">Secret Path</SelectItem>
                        <SelectItem value="metadataKey">Metadata Key</SelectItem>
                        <SelectItem value="metadataValue">Metadata Value</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex w-36 items-center space-x-2">
                <Controller
                  control={control}
                  name={`permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions.${index}.operator`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0 flex-grow"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => field.onChange(e)}
                        className="w-full"
                      >
                        {renderOperatorSelectItems(condition.lhs)}
                      </Select>
                    </FormControl>
                  )}
                />
                <div>
                  <Tooltip
                    asChild
                    content={getConditionOperatorHelperInfo(
                      condition?.operator as PermissionConditionOperators
                    )}
                    className="max-w-xs"
                  >
                    <FontAwesomeIcon icon={faInfoCircle} size="xs" className="text-gray-400" />
                  </Tooltip>
                </div>
              </div>
              <div className="flex-grow">
                <Controller
                  control={control}
                  name={`permissions.${ProjectPermissionSub.DynamicSecrets}.${position}.conditions.${index}.rhs`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0 flex-grow"
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <div>
                <IconButton
                  ariaLabel="plus"
                  variant="outline_bg"
                  className="p-2.5"
                  onClick={() => items.remove(index)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
      {conditionErrorMessage && (
        <div className="flex items-center space-x-2 py-2 text-sm text-gray-400">
          <FontAwesomeIcon icon={faWarning} className="text-red" />
          <span>{conditionErrorMessage}</span>
        </div>
      )}
      <div>
        <Button
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          variant="star"
          size="xs"
          className="mt-3"
          isDisabled={isDisabled}
          onClick={() =>
            items.append({
              lhs: "environment",
              operator: PermissionConditionOperators.$EQ,
              rhs: ""
            })
          }
        >
          Add Condition
        </Button>
      </div>
    </div>
  );
};
