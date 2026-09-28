export const CLI_COMMAND_NAME = "dweis";
export const CLI_PROCESS_NAME = "dweis-cli";

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};
