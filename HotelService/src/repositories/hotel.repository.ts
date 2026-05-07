import logger from "../config/logger.config";
import Hotel from "../db/models/hotel";

import { NotFoundError } from "../utils/errors/app.error";
import BaseRepository from "./base.repository";

// export async function createHotel(hotelData: createHotelDTO){
//     const hotel = await Hotel.create({
//         name: hotelData.name,
//         address: hotelData.address,
//         location: hotelData.location,
//         rating: hotelData.rating,
//         ratingCount: hotelData.ratingCount,
//     })

//     logger.info(`Hotel created with id: ${hotel.id}`)
//     return hotel;
// }

// export async function getHotelById(id: number) {
//     const hotel = await Hotel.findByPk(id)

//     if(!hotel) {
//         logger.error(`Hotel not found: ${id}`)
//         throw new NotFoundError(`Hotel with id ${id} not found`);
//     }
//     logger.info(`Hotel found: ${hotel.id}`)
//     return hotel;
// }

// export async function getAllHotels() {
//     const hotels = await Hotel.findAll({
//         where: {
//             deletedAt: null,
//         },
//     });

//     if(!hotels) {
//         logger.error(`No hotels found`)
//         throw new NotFoundError(`No hotels found`)
//     }

//     logger.info(`Hotels found: ${hotels.length}`)
//     return hotels;
// }

// export async function softDeleteHotel(id: number) {
//     const hotel = await Hotel.findByPk(id);

//     if(!hotel) {
//         logger.error(`Hotel not found: ${id}`);
//         throw new NotFoundError(`Hotel with id ${id} not found`)
//     }

//     hotel.deletedAt = new Date();
//     await hotel.save(); // save changes to database
//     logger.info(`Hotel soft deleted: ${hotel.id}`)
//     return true;
// }


export class HotelRepository extends BaseRepository<Hotel> {
    constructor() {
        super(Hotel)
    }

    async findAll() {
        const hotels = await this.model.findAll({
            where: {
                deletedAt: null
            }
        })
        if(!hotels) {
            logger.error(`No hotels found`)
            throw new NotFoundError(`No hotels found`)
        }
        logger.info(`Hotels found: ${hotels.length}`)
        return hotels;
    }

    async softDelete(id: number) {
        const hotel = await Hotel.findByPk(id);

        if(!hotel) {
            logger.error(`Hotel not found ${id}`)
            throw new NotFoundError(`Hotel with id ${id} not found`)
        }
        hotel.deletedAt = new Date();
        await hotel.save();
        logger.info(`Hotel soft deleted: ${hotel.id}`)
        return true;
    }
}