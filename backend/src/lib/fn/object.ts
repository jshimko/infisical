/**
 * Pick a list of properties from an object
 * into a new object
 */
export const pick = <T extends object, TKeys extends keyof T>(obj: T, keys: TKeys[]): Pick<T, TKeys> => {
  if (!obj) return {} as Pick<T, TKeys>;
  return keys.reduce(
    (acc, key) => {
      if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
      return acc;
    },
    {} as Pick<T, TKeys>
  );
};

/**
 * Omit a list of properties from an object
 * into a new object
 */
export const omit = <T extends object, TKeys extends keyof T>(obj: T, keys: TKeys[]): Omit<T, TKeys> => {
  if (!obj) return {} as Omit<T, TKeys>;
  return (Object.keys(obj) as TKeys[]).reduce(
    (acc, key) => {
      if (!keys.includes(key)) {
        (acc as T)[key] = obj[key];
      }
      return acc;
    },
    {} as Omit<T, TKeys>
  );
};
/**
 * Removes (shakes out) undefined entries from an
 * object. Optional second argument shakes out values
 * by custom evaluation.
 */
export const shake = <RemovedKeys extends string, T = object>(
  obj: T,
  filter: (value: unknown) => boolean = (x) => x === undefined || x === null
): Omit<T, RemovedKeys> => {
  if (!obj) return {} as T;
  const keys = Object.keys(obj) as (keyof T)[];
  return keys.reduce((acc, key) => {
    if (filter(obj[key])) {
      return acc;
    }
    acc[key] = obj[key];
    return acc;
  }, {} as T);
};
