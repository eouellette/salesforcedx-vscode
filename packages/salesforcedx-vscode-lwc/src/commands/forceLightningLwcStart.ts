import {
  CliCommandExecutor,
  Command,
  SfdxCommandBuilder
} from '@salesforce/salesforcedx-utils-vscode/out/src/cli';
import { ContinueResponse } from '@salesforce/salesforcedx-utils-vscode/out/src/types';
import * as open from 'open';
import { Subject } from 'rxjs/Subject';
import * as vscode from 'vscode';
import { nls } from '../messages';
import { DevServerService } from '../service/devServerService';

const sfdxCoreExports = vscode.extensions.getExtension(
  'salesforce.salesforcedx-vscode-core'
)!.exports;
const {
  channelService,
  taskViewService,
  telemetryService,
  notificationService,
  SfdxCommandlet,
  ProgressNotification,
  EmptyParametersGatherer,
  SfdxWorkspaceChecker
} = sfdxCoreExports;
const SfdxCommandletExecutor = sfdxCoreExports.SfdxCommandletExecutor;

const baseUrl = 'http://localhost:3333';
const serverStartedId = 'Server up';

export interface ForceLightningLwcStartOptions {
  /** whether to automatically open the browser after server start */
  openBrowser: boolean;
  /** optional starting path (should begin with `/`) */
  urlPath?: string;
}

export class ForceLightningLwcStartExecutor extends SfdxCommandletExecutor<{}> {
  private readonly options: ForceLightningLwcStartOptions;

  constructor(options: ForceLightningLwcStartOptions = { openBrowser: true }) {
    super();
    this.options = options;
  }

  public build(): Command {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('force_lightning_lwc_start_text'))
      .withArg('force:lightning:lwc:start')
      .withLogName('force_lightning_lwc_start')
      .withJson()
      .build();
  }

  public execute(response: ContinueResponse<{}>): void {
    const startTime = process.hrtime();
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const cancellationToken = cancellationTokenSource.token;

    const executor = new CliCommandExecutor(this.build(), {
      cwd: this.executionCwd,
      env: { SFDX_JSON_TO_STDOUT: 'true' }
    });
    const execution = executor.execute(cancellationToken);
    const executionName = execution.command.toString();

    DevServerService.instance.registerServerHandler({
      stop: async () => {
        return execution.killExecution('SIGTERM');
      }
    });

    channelService.streamCommandOutput(execution);
    channelService.showChannelOutput();

    let serverStarted = false;

    const progress = new Subject();
    ProgressNotification.show(
      execution,
      cancellationTokenSource,
      vscode.ProgressLocation.Notification,
      progress.asObservable()
    );

    const task = taskViewService.addCommandExecution(
      execution,
      cancellationTokenSource
    );

    // listen for server startup
    execution.stdoutSubject.subscribe(async data => {
      if (!serverStarted && data && data.toString().includes(serverStartedId)) {
        serverStarted = true;
        progress.complete();
        taskViewService.removeTask(task);
        notificationService.showSuccessfulExecution(executionName);

        if (this.options.openBrowser) {
          await open(baseUrl + (this.options.urlPath || ''));
        }

        this.logMetric(execution.command.logName, startTime);
      }
    });

    // handler errors
    execution.processExitSubject.subscribe(async exitCode => {
      DevServerService.instance.clearServerHandler();

      if (!serverStarted) {
        let message = nls.localize('force_lightning_lwc_start_failed');

        // TODO proper exit codes in lwc-dev-server for address in use, auth/org error, etc.
        if (exitCode === 127) {
          message = nls.localize('force_lightning_lwc_start_not_found');
        }

        notificationService.showErrorMessage(message);
        channelService.appendLine(message);
        telemetryService.sendException('Error', message);
        notificationService.showFailedExecution(executionName);
      } else if (exitCode !== undefined && exitCode !== null && exitCode > 0) {
        const message = nls.localize('warning_message_server_exited');
        notificationService.showErrorMessage(message);
        telemetryService.sendException('Error', `${message}: ${exitCode}`);
      }
    });

    notificationService.reportExecutionError(
      executionName,
      execution.processErrorSubject
    );

    cancellationToken.onCancellationRequested(() => {
      notificationService.showCanceledExecution(executionName);
    });
  }
}

export async function forceLightningLwcStart() {
  if (DevServerService.instance.isServerHandlerRegistered()) {
    const warningMessage = nls.localize('warning_message_server_running');
    const openBrowserOption = nls.localize('prompt_option_open_browser');
    const restartOption = nls.localize('prompt_option_restart');
    const response = await notificationService.showWarningMessage(
      warningMessage,
      openBrowserOption,
      restartOption
    );
    if (response === openBrowserOption) {
      await open(baseUrl);
      return;
    } else if (response === restartOption) {
      channelService.appendLine(
        nls.localize('force_lightning_lwc_server_stopping')
      );
      await DevServerService.instance.stopServer();
    } else {
      console.log('local development server already running, no action taken');
      return;
    }
  }

  const preconditionChecker = new SfdxWorkspaceChecker();
  const parameterGatherer = new EmptyParametersGatherer();
  const executor = new ForceLightningLwcStartExecutor();

  const commandlet = new SfdxCommandlet(
    preconditionChecker,
    parameterGatherer,
    executor
  );

  await commandlet.run();
}
