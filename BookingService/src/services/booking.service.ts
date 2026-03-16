import { CreateBookingDTO } from "../dto/booking.dto";
import { confirmBooking, createBooking, createIdempotencyKey, finalizeIdempotencyKey, getIdempotencyKey } from "../repositories/booking.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { generateIdempotencyKey } from "../utils/generateIdempotencyKey";

export async function createBookingService(CreateBookingDTO: CreateBookingDTO){
    const booking = await createBooking({
        userId: CreateBookingDTO.userId,
        hotelId: CreateBookingDTO.hotelId,
        totalGuests: CreateBookingDTO.totalGuests,
        bookingAmount: CreateBookingDTO.bookingAmount,                                     
    });

    const idempotencyKey = generateIdempotencyKey();

    await createIdempotencyKey(idempotencyKey, booking.id);

    return {
        bookingId: booking.id,
        idempotencyKey: idempotencyKey
    }
}

export async function confirmBookingService(idempotencyKey: string) {
    const idempotencyKeyData = await getIdempotencyKey(idempotencyKey)

    if(!idempotencyKeyData) {
        throw new NotFoundError('Idempotency key not found.')
    }
 
    if(idempotencyKeyData.finalized) {
        throw new BadRequestError('Idempotency key already finalized, booking already confirmed.')
    }

    const booking = await confirmBooking(idempotencyKeyData.id);
    await finalizeIdempotencyKey(idempotencyKey);
     
    return booking;
}   