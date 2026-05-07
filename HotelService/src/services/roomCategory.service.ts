import { CreateRoomCategoryDTO } from "../dto/roomCategory.dto";
import { HotelRepository } from "../repositories/hotel.repository";
import RoomCategoryRepository from "../repositories/roomCategory.repository";
import { NotFoundError } from "../utils/errors/app.error";

const roomCategoryRepository = new RoomCategoryRepository();
const hotelRepository = new HotelRepository();

export async function createRoomCategoryService(createRoomCategoryDTO: CreateRoomCategoryDTO) {
    const roomCategory = await roomCategoryRepository.create(createRoomCategoryDTO);
    return roomCategory;
}

//updation

export async function getRoomCategoryByIdService(id: number) {
    const roomCategory = await roomCategoryRepository.findById(id);
    return roomCategory;
}

export async function getAllRoomCategoriesByHotelIdService(hotelId: number) {
    const hotel = await hotelRepository.findById(hotelId);

    if(!hotel) {
        throw new NotFoundError(`Hotel with id ${hotelId} not found`)
    }

    const roomCategories = await roomCategoryRepository.findAllByHotelId(hotelId);

    return roomCategories
}

export async function deleteRoomCategoryService(id: number) {
    const roomCategory = await roomCategoryRepository.findById(id)

    if(!roomCategory) {
        throw new NotFoundError(`Room category with id ${id} not found`)
    }

    await roomCategoryRepository.delete({ id });
    return true;
}