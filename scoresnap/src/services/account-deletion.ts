/**
 * Account deletion only runs after the in-app confirmation.
 * Remote deletion runs first. Local keys are wiped only after it succeeds,
 * so a failed server delete does not clear the device and claim the account is gone.
 */
export async function performAccountDeletion(args: {
  confirmed: boolean;
  deleteRemote: () => Promise<void>;
  wipeLocal: () => Promise<void>;
}): Promise<void> {
  if (!args.confirmed) throw new Error("Confirm account deletion before continuing.");
  await args.deleteRemote();
  await args.wipeLocal();
}
