import { Prisma } from "@prisma/client";
import prismaClient from "../../prisma/client";




export async function createBooking(bookingInput: Prisma.bookingCreateInput) {
    const booking = await prismaClient.booking.create({
        data: bookingInput
    });

    return booking;
}

export async function createIdempotencyKey(key: string, bookingId: number) {
    const idempotencyKey = await prismaClient.idempotencykey.create({
        data: {
            key,
            updatedAt: new Date(),
            booking: {
                connect: {
                    id: bookingId
                }
            }
        }
    });

    return idempotencyKey;
}


export async function getIdempotencyKey(key: string) {
    const idempotencyKey = await prismaClient.idempotencykey.findUnique({
        where: {
            key
        }
    })
    return idempotencyKey;
}


export async function getBookingById(bookingId: number) {
    const booking = await prismaClient.booking.findUnique({
        where: {
            id: bookingId
        }
    })

    return booking;
}


export async function confirmBooking(bookingId: number) {
    const booking = await prismaClient.booking.update({
        where: {
            id: bookingId
        },
        data: {
            status: "CONFIRMED"
        }
    })

    return booking;
}


export async function cancelBooking(bookingId: number) {
    const booking = await prismaClient.booking.update({
        where: {
            id: bookingId
        },
        data: {
            status: "CANCELLED"
        }
    });
    return booking;
}


export async function  finalizeIdempotencyKey(key: string) {
    const idempotencyKey = await prismaClient.idempotencykey.update({
        where: {
            key
        },
        data: {
            finalized: true
        }
    });

    return idempotencyKey;                 
}