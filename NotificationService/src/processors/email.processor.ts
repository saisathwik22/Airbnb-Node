import { Job, Worker } from "bullmq";
import { NotificationDto } from "../dto/notification.dto";
import { MAILER_QUEUE } from "../queues/mailer.queue";
import { getRedisConnObject } from "../config/redis.config";
import { MAILER_PAYLOAD } from "../producers/email.producer";

export const setUpMailerWorker = () => {
    const emailProcessor = new Worker<NotificationDto>(
        MAILER_QUEUE, // name of the queue
        async (job: Job) => {
            if(job.name !== MAILER_PAYLOAD) {
                throw new Error("Invalid job name")
            }
            // call the service layer from here to process the email

            const payload = job.data;
            console.log(`Processing email with payload: ${JSON.stringify(payload)}`)
            
        }, // process function - logic of how email should be processed will go here
        {
            connection: getRedisConnObject()
        }, // config obj - which redis instance to connect to
    )

    emailProcessor.on("failed", () => {
        console.error("Email processing failed")
    })

    emailProcessor.on("completed", () => {
        console.log("Email processing completed successfully")
    })
}