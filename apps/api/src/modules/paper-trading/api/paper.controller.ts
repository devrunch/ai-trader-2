import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PaperPlaceOrderRequestSchema, type PaperAccount, type PaperFill, type PaperOrder, type PaperPosition } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { CancelOrder, PlaceOrder, ReadPortfolio } from '../application';
import { FillsQuerySchema, OrderIdSchema, OrdersQuerySchema, toFillDto, toOrderDto, toPositionDto } from './paper.dto';

type AuthRequest = Request & { authUser?: { id: string } };

function userOf(request: AuthRequest): string {
  if (!request.authUser) throw new UnauthorizedException();
  return request.authUser.id;
}

/** Paper trading only: nothing here reaches a broker. Writes need the session and the CSRF header (E9: never queued). */
@Controller('v1/paper')
@UseGuards(SessionGuard)
export class PaperController {
  constructor(@Inject(PlaceOrder) private readonly place: PlaceOrder, @Inject(CancelOrder) private readonly cancelOrder: CancelOrder,
    @Inject(ReadPortfolio) private readonly portfolio: ReadPortfolio) {}

  @Get('account')
  async account(@Req() request: AuthRequest): Promise<{ account: PaperAccount }> {
    return { account: await this.portfolio.account(userOf(request)) };
  }

  @Get('accounts')
  async accounts(@Req() request: AuthRequest): Promise<{ accounts: PaperAccount[] }> {
    return { accounts: await this.portfolio.accounts(userOf(request)) };
  }

  @Get('orders')
  async orders(@Req() request: AuthRequest, @Query() raw: unknown): Promise<{ orders: PaperOrder[] }> {
    const query = OrdersQuerySchema.parse(raw);
    const orders = await this.portfolio.orders(userOf(request), { openOnly: query.status === 'open', limit: query.limit });
    return { orders: orders.map(toOrderDto) };
  }

  @Post('orders') @UseGuards(CsrfHeaderGuard)
  async placeOrder(@Req() request: AuthRequest, @Body() raw: unknown): Promise<{ order: PaperOrder }> {
    const order = await this.place.execute(userOf(request), PaperPlaceOrderRequestSchema.parse(raw));
    return { order: toOrderDto(order) };
  }

  @Post('orders/:id/cancel') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  async cancel(@Req() request: AuthRequest, @Param('id') id: string): Promise<{ order: PaperOrder }> {
    return { order: toOrderDto(await this.cancelOrder.execute(userOf(request), OrderIdSchema.parse(id))) };
  }

  @Get('positions')
  async positions(@Req() request: AuthRequest): Promise<{ positions: PaperPosition[] }> {
    return { positions: (await this.portfolio.positions(userOf(request))).map(toPositionDto) };
  }

  @Get('fills')
  async fills(@Req() request: AuthRequest, @Query() raw: unknown): Promise<{ fills: PaperFill[] }> {
    const { limit } = FillsQuerySchema.parse(raw);
    return { fills: (await this.portfolio.fills(userOf(request), limit)).map(toFillDto) };
  }
}
