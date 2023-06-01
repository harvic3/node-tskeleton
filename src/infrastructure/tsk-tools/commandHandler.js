const {
  getLinePositionByContent,
  getLinePositionByContentInverse,
  addLinesBeforePosition,
  addLinesAfterPosition,
  replaceContentLineInPosition,
  addContentToBeginning,
} = require("./fileUtils");
const {
  capitalize,
  toCamelCase,
  replaceAll,
  addCharToStar,
  pathToOS,
  replaceDoubleSpaces,
} = require("./stringUtils");
const { writeFileSync, mkdirSync, readFileSync, existsSync } = require("fs");
const { helpDescription, templates } = require("./templates");
const { resolve, join } = require("path");
const EQUAL_CHAR = "=",
  SLASH_CHAR = "/",
  SPACE_CHAR = " ",
  HELP_COMMAND = "help";

const controllerStrategy = {
  newController: (
    useCaseName,
    useCaseNameCamel,
    apiName,
    apiNameCapitalized,
    actionName,
    endPoint,
    httpMethodLower,
  ) => {
    const controllerTemplate = replaceAll(templates.controllerTemplate, {
      "{{UseCaseName}}": useCaseName,
      "{{UseCaseNameCamel}}": useCaseNameCamel,
      "{{EndPoint}}": endPoint,
      "{{HttpMethodLower}}": httpMethodLower,
      "{{ApiNameCapitalized}}": apiNameCapitalized,
      "{{ApiNameUpper}}": apiName.toUpperCase(),
    });
    const controllerContainerTemplate = replaceAll(templates.controllerContainerTemplate, {
      "{{UseCaseName}}": useCaseName,
      "{{ApiName}}": apiName,
      "{{ActionName}}": actionName,
    });

    return { controllerTemplate, controllerContainerTemplate };
  },
  existingController: (
    settingsFile,
    controllerPath,
    containerPath,
    useCaseName,
    useCaseNameCamel,
    apiName,
    actionName,
    endPoint,
    httpMethodLower,
  ) => {
    let controllerContent = readFileSync(controllerPath, "utf8");
    const importLineNumber = getLinePositionByContent(
      controllerContent,
      settingsFile.controllerImportLineToFind,
    );
    const importControllerContent = replaceAll(templates.importControllerTemplate, {
      "{{UseCaseName}}": useCaseName,
    });
    controllerContent = replaceContentLineInPosition(
      controllerContent,
      importLineNumber,
      settingsFile.controllerImportLineToFind,
      importControllerContent,
    );
    const functionLineNumber = getLinePositionByContent(
      controllerContent,
      settingsFile.controllerFunctionLineToFind,
    );
    const functionContextTemplate = replaceAll(templates.functionControllerTemplate, {
      "{{UseCaseNameCamel}}": useCaseNameCamel,
      "{{UseCaseName}}": useCaseName,
    });
    controllerContent = addLinesBeforePosition(
      controllerContent,
      functionLineNumber,
      functionContextTemplate,
    );
    const routerLineNumber = getLinePositionByContent(
      controllerContent,
      settingsFile.controllerRouterLineToFind,
    );
    const routerContextTemplate = replaceAll(templates.routerControllerTemplate, {
      "{{HttpMethodLower}}": httpMethodLower,
      "{{EndPoint}}": endPoint,
      "{{UseCaseNameCamel}}": useCaseNameCamel,
    });
    controllerContent = addLinesAfterPosition(
      controllerContent,
      routerLineNumber,
      routerContextTemplate,
    );

    let controllerContainerContent = readFileSync(containerPath, "utf8");
    const containerExportLineNumber = getLinePositionByContentInverse(
      controllerContainerContent,
      settingsFile.containerExportLineToFind,
    );
    const exportContainerContent = replaceAll(templates.exportContainerTemplate + ", ", {
      "{{UseCaseName}}": useCaseName,
    });
    controllerContainerContent = replaceContentLineInPosition(
      controllerContainerContent,
      containerExportLineNumber,
      settingsFile.containerExportLineToFind,
      exportContainerContent,
    );
    const useCaseContainerTemplate = replaceDoubleSpaces(
      replaceAll(templates.addUseCaseContainerTemplate, {
        "{{UseCaseName}}": useCaseName,
      }),
    );
    controllerContainerContent = addLinesBeforePosition(
      controllerContainerContent,
      containerExportLineNumber,
      useCaseContainerTemplate,
    );
    const importContainerContent = replaceAll(templates.importContainerTemplate, {
      "{{UseCaseName}}": useCaseName,
      "{{ApiName}}": apiName,
      "{{ActionName}}": actionName,
    });
    controllerContainerContent = addContentToBeginning(
      controllerContainerContent,
      importContainerContent,
    );

    return {
      controllerTemplate: controllerContent,
      controllerContainerTemplate: controllerContainerContent,
    };
  },
};

function addUseCase(args, settingsFile) {
  const warningMessage =
    "Missing parameters. Please provide api-name, use-case, endpoint and http-method";
  if (args.length !== 4) {
    console.warn(warningMessage);
    return;
  }

  const apiName = args[0].split(EQUAL_CHAR)[1];
  const apiNameCapitalized = capitalize(apiName);
  const useCaseName = capitalize(args[1].split(EQUAL_CHAR)[1]);
  const endPoint = addCharToStar(args[2].split(EQUAL_CHAR)[1].toLowerCase(), SLASH_CHAR);
  const httpMethod = args[3].split(EQUAL_CHAR)[1].toUpperCase();

  if (!apiName || !useCaseName || !endPoint || !httpMethod) {
    console.warn(warningMessage);
    return;
  }

  if (!settingsFile.httpMethodsAllowed.includes(httpMethod.toLowerCase())) {
    console.warn(
      `Http method ${httpMethod} is not allowed. Please set in into settings.json and IRouter.ts`,
    );
    return;
  }

  const useCaseNameCamel = toCamelCase(useCaseName);
  const actionName = useCaseNameCamel.split(/(?=[A-Z])/)[0];
  const useCasePath = resolve(
    `./src/application/modules/${apiName}/useCases/${actionName}/index.ts`,
  );
  if (existsSync(useCasePath)) {
    console.warn(`Use case as ${useCaseName} already exists in \n${pathToOS(useCasePath)}`);
    return;
  }

  const httpMethodLower = httpMethod.toLowerCase();
  const controllerPath = resolve(
    `./src/adapters/controllers/${apiName}/${apiNameCapitalized}.controller.ts`,
  );
  const existsController = existsSync(controllerPath);
  const controllerContainerPath = resolve(
    `./src/adapters/controllers/${apiName}/container/index.ts`,
  );

  const { controllerTemplate, controllerContainerTemplate } = existsController
    ? controllerStrategy.existingController(
        settingsFile,
        controllerPath,
        controllerContainerPath,
        useCaseName,
        useCaseNameCamel,
        apiName,
        actionName,
        endPoint,
        httpMethodLower,
      )
    : controllerStrategy.newController(
        useCaseName,
        useCaseNameCamel,
        apiName,
        apiNameCapitalized,
        actionName,
        endPoint,
        httpMethodLower,
      );

  const useCaseTemplate = replaceAll(templates.useCaseTemplate, {
    "{{UseCaseName}}": useCaseName,
  });

  const testUseCasePath = resolve(
    `./src/application/modules/${apiName}/useCases/${actionName}/${useCaseName}UseCase.test.ts`,
  );
  const testUseCaseTemplate = replaceAll(templates.testUseCaseTemplate, {
    "{{UseCaseName}}": useCaseName,
  });

  try {
    if (!existsController) {
      mkdirSync(join(controllerPath, ".."), { recursive: true });
      mkdirSync(join(controllerContainerPath, ".."), { recursive: true });
    }
    writeFileSync(controllerPath, controllerTemplate);

    writeFileSync(controllerContainerPath, controllerContainerTemplate);

    mkdirSync(join(useCasePath, ".."), { recursive: true });
    writeFileSync(useCasePath, useCaseTemplate);
    writeFileSync(testUseCasePath, testUseCaseTemplate);

    console.log(
      `${useCaseName}UseCase and its dependencies were created with:\n apiName=${apiName}\n use-case=${useCaseName}\n endPoint=${endPoint}\n httpMethod=${httpMethod}`,
    );
  } catch (error) {
    console.error(`Error creating use case ${useCaseName}`, error);
  }
}

const executeCommand = (args) => {
  if (!args?.length) args = [HELP_COMMAND];
  args = args.split(SPACE_CHAR).filter((param) => !!param);
  if (args[0] !== HELP_COMMAND) console.log("Executing command:\n", args.join(SPACE_CHAR));
  const command = args.shift().toLowerCase();

  switch (command) {
    case HELP_COMMAND:
      console.log(helpDescription);
      break;
    case "add-use-case":
      const abSolutePathSettingsFile = resolve(__dirname, "./settings.json");
      try {
        const settingsFile = JSON.parse(readFileSync(abSolutePathSettingsFile, "utf8"));
        addUseCase(args, settingsFile);
      } catch (error) {
        console.error("Error reading settings file", error);
      }
      break;
    default:
      console.warn("Command not found, try with help command");
  }
};

module.exports = { executeCommand };
