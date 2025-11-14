import { Test, TestingModule } from '@nestjs/testing';
import { CalendarPlanningController } from './calendar-planning.controller';
import { CalendarPlanningService } from './calendar-planning.service';

describe('CalendarPlanningController', () => {
  let controller: CalendarPlanningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarPlanningController],
      providers: [CalendarPlanningService],
    }).compile();

    controller = module.get<CalendarPlanningController>(CalendarPlanningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
