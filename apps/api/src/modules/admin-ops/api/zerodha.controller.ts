import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZerodhaConnect } from '../application/zerodha-connect.js';
import { SessionGuard, RolesGuard, Roles, CsrfHeaderGuard } from '../../auth/api/index.js';
import { BadRequestValidationError } from '../../../shared/errors/index.js';

const tokenBody = z.object({ requestToken: z.string() });
@Controller('v1/admin/zerodha')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class ZerodhaController {
  constructor(private readonly connect: ZerodhaConnect) {}
  @Get() status() { return this.connect.status(); }
  @Post('token') @UseGuards(CsrfHeaderGuard)
  token(@Body() body: unknown) {
    const parsed = tokenBody.parse(body);
    if (!/^[A-Za-z0-9]{8,64}$/.test(parsed.requestToken)) {
      throw new BadRequestValidationError('Invalid request token', { reason: 'INVALID_REQUEST_TOKEN' });
    }
    return this.connect.connect(parsed.requestToken);
  }
  @Post('auto-login') @UseGuards(CsrfHeaderGuard)
  autoLogin() { return this.connect.autoLogin(); }
  @Post('disconnect') @UseGuards(CsrfHeaderGuard)
  disconnect() { return this.connect.disconnect(); }
}
