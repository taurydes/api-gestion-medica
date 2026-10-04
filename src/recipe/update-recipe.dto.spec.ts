import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const body = (value: object) => pipe.transform(value, { type: 'body', metatype: UpdateRecipeDto });

describe('PATCH /recipes/:id keeps the consultation fields (MJ-28)', () => {
  it.each(['medicalAppointmentId', 'patientId', 'doctorId', 'medicalHistoryId'])(
    '%s in the body → 400 naming the field, not a silent drop',
    async (field) => {
      await expect(body({ notes: 'x', [field]: '44444444-4444-4444-8444-444444444444' })).rejects.toThrow(
        BadRequestException,
      );
      const error: BadRequestException = await body({ [field]: 'x' }).catch((e) => e);
      expect(JSON.stringify(error.getResponse())).toContain(`${field} no se puede cambiar en una receta emitida.`);
    },
  );

  it('editable fields still pass', async () => {
    await expect(body({ notes: 'Tomar con agua', diagnosis: 'Control' })).resolves.toMatchObject({
      notes: 'Tomar con agua',
      diagnosis: 'Control',
    });
  });
});
