/*!
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 */

import * as path from "path";
import * as sarif from "sarif";
import { RunInfo } from "./common/Interfaces";
import { Utilities } from "./Utilities";

/**
 * Class that holds the run information processed from the Sarif run
 */
export class RunInfoFactory {

    /**
     * Processes the run passed in and creates a new RunInfo object with the information processed
     * @param run SARIF run object to process
     * @param sarifFileName path and file name of the sarif file this run is in
     */
    public static Create(run: sarif.Run, sarifFileName: string): RunInfo {
        const tool: sarif.ToolComponent  = run.tool.driver;

        let toolFullName: string = tool.fullName || tool.name;

        if (tool.semanticVersion) {
            toolFullName += `(${tool.semanticVersion})`;
        }

        let toolFileName: string | undefined;
        let workingDir: string | undefined;
        let cmdLine: string | undefined;
        let startUtc: string | undefined;
        let timeDuration: string | undefined;
        let automationIdentifier: string | undefined;
        let automationCategory: string | undefined;

        if (run.invocations && run.invocations[0]) {
            const invocation: sarif.Invocation = run.invocations[0];
            cmdLine = invocation.commandLine;
            if (invocation.executableLocation) {
                toolFileName = invocation.executableLocation.uri;
            }

            if (invocation.workingDirectory) {
                workingDir = invocation.workingDirectory.uri;
            }

            startUtc = invocation.startTimeUtc;
            timeDuration = Utilities.calcDuration(invocation.startTimeUtc, invocation.endTimeUtc);
        }

        if (run.automationDetails !== undefined && run.automationDetails.id !== undefined) {
            const splitId: string[] = run.automationDetails.id.split("/");
            const identifier: string | undefined = splitId.pop();
            if (identifier !== "") {
                automationIdentifier = identifier;
            }

            const category: string = splitId.join("/");
            if (identifier !== "") {
                automationCategory = category;
            }
        }

        return {
            id: 0,
            toolName: tool.name,
            toolFullName: toolFullName,
            toolFileName: toolFileName,
            workingDir: workingDir,
            cmdLine: cmdLine,
            timeDuration: timeDuration,
            additionalProperties: run.properties,
            uriBaseIds: Utilities.expandBaseIds(run.originalUriBaseIds),
            sarifFileFullPath: sarifFileName,
            sarifFileName: path.basename(sarifFileName),
            automationCategory: automationCategory,
            automationIdentifier: automationIdentifier,
            startUtc: startUtc
        };
    }
}
