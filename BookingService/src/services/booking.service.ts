import { CreateBookingDTO } from "../dto/booking.dto";
import { confirmBooking, createBooking, createIdempotencyKey, finalizeIdempotencyKey, getIdempotencyKeyWithLock } from "../repositories/booking.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { generateIdempotencyKey } from "../utils/generateIdempotencyKey";

import prismaClient from "../../prisma/client";

export async function createBookingService(CreateBookingDTO: CreateBookingDTO) {
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

// Potential issues and improvements ??
// wrapping complete logic in single transaction
export async function confirmBookingService(idempotencyKey: string) {

    return await prismaClient.$transaction(async (tx) => {
        const idempotencyKeyData = await getIdempotencyKeyWithLock(tx, idempotencyKey)

        if (!idempotencyKeyData || !idempotencyKeyData.bookingId) {
            throw new NotFoundError('Idempotency key not found.')
        }

        if (idempotencyKeyData.finalized) {
            throw new BadRequestError('Idempotency key already finalized, booking already confirmed.')
        }

        const booking = await confirmBooking(tx, idempotencyKeyData.bookingId);
        await finalizeIdempotencyKey(tx, idempotencyKey);

        return booking;
    });


}

// Two back to back requests made from same user with very negligable seconds of difference.
// How will it handle this type of concurrency issue from same user ?
// Pessimistic Lock
// ensure that one of user request succeeds
// So, the first request gets a lock and rest wait.
// first will be processed and completed, rest will be dropped.