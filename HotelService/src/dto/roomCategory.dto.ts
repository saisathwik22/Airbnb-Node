import { RoomType } from "../db/models/roomCategory";

export type CreateRoomCategoryDTO = {
    hotelId: number;
    price: number;
    roomType: RoomType;
    roomCount: number;
}