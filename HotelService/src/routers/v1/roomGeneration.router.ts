import express from 'express'
import { validateRequestBody } from '../../validators'
import { generateRoomHandler } from '../../controllers/roomGeneration.controller';
import { RoomGenerationJobSchema } from '../../dto/roomGeneration.dto';


const roomGenerationRouter = express.Router();

roomGenerationRouter.post(
    '/',
    validateRequestBody(RoomGenerationJobSchema),
    generateRoomHandler
);

export default roomGenerationRouter