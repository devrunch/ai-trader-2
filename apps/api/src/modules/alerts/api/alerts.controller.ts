import { Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { NOTIFIER, maskAddress, type Notifier, type SendResult } from '../../../shared/notify';
import { CsrfHeaderGuard, Roles, RolesGuard, SessionGuard } from '../../auth/api/index';

@Controller('v1/admin/alerts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AlertsController {
  constructor(@Inject(NOTIFIER) private readonly notifier: Notifier) {}

  @Get()
  status(): { configured: boolean; recipients: string[] } {
    return { configured: this.notifier.configured, recipients: this.notifier.recipients.map(maskAddress) };
  }

  @Post('test') @UseGuards(CsrfHeaderGuard)
  async test(): Promise<{ result: SendResult }> {
    return { result: await this.notifier.send({ subject: 'Test email', text: 'Alerts from AI Trader reach this address.' }) };
  }
}
