import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { showError } from '../../../src/commands/commandUtils';

const sfdxCoreExports = vscode.extensions.getExtension(
  'salesforce.salesforcedx-vscode-core'
)!.exports;
const {
  channelService,
  notificationService,
  telemetryService
} = sfdxCoreExports;

describe('command utilities', () => {
  describe('showError', () => {
    it('should call the telemetry service', async () => {
      const spy = sinon.spy(telemetryService, 'sendException');

      showError(
        new Error('test error message'),
        'force_lightning_lwc_start_test',
        'SFDX: Start Local Development Server'
      );

      sinon.assert.calledOnce(spy);
      sinon.assert.calledWith(
        spy,
        `force_lightning_lwc_start_test_error`,
        'test error message'
      );
    });

    it('should call the notification service', () => {
      const spy = sinon.spy(notificationService, 'showErrorMessage');

      showError(
        new Error('test error message'),
        'force_lightning_lwc_start_test',
        'SFDX: Start Local Development Server'
      );

      sinon.assert.calledOnce(spy);
      sinon.assert.calledWith(
        spy,
        sinon.match('SFDX: Start Local Development Server')
      );
    });

    it('should send a message to the channel', () => {
      const spy = sinon.spy(channelService, 'appendLine');

      showError(
        new Error('test error message'),
        'force_lightning_lwc_start_test',
        'SFDX: Start Local Development Server'
      );

      sinon.assert.calledOnce(spy);
      sinon.assert.calledWith(spy, `Error: test error message`);
    });

    it('should open the channel', () => {
      const spy = sinon.spy(channelService, 'openChannel');

      showError(
        new Error('test error message'),
        'force_lightning_lwc_start_test',
        'SFDX: Start Local Development Server'
      );

      sinon.assert.calledOnce(spy);
    });
  });
});
