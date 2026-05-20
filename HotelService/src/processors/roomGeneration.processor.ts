import { Job, Worker } from "bullmq";
import { getRedisConnObject } from "../config/redis.config";
import logger from "../config/logger.config";
import { RoomGenerationJob } from "../dto/roomGeneration.dto";
import { ROOM_GENERATION_QUEUE } from "../queues/roomGeneration.queue";
import { ROOM_GENERATION_PAYLOAD } from "../producers/roomGeneration.producer";
import { generateRooms } from "../services/roomGeneration.service";

export const setupRoomGenerationWorker = () => {
    const roomGenerationProcessor = new Worker<RoomGenerationJob>(
        ROOM_GENERATION_QUEUE,
        async (job: Job) => {
            
            if(job.name !== ROOM_GENERATION_PAYLOAD) {
                throw new Error("Invalid job name")
            }

            const payload = job.data
            console.log(`Processing room generation for: ${JSON.stringify(payload)}`)

            await generateRooms(payload)

            logger.info(`Room generation completed for: ${JSON.stringify(payload)}`)
            
        }, 
        {
            connection: getRedisConnObject()
        }, 
    )

    roomGenerationProcessor.on("failed", () => {
        console.error("Room generation processing failed")
    })

    roomGenerationProcessor.on("completed", () => {
        console.log("Room generation processing completed successfully")
    })
}