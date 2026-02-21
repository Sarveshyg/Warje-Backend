import { createClient } from 'redis'

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    tls: true,
    rejectUnauthorized: false,
    reconnectStrategy: (retries) => {
      if (retries > 5) return new Error('Max retries reached')
      return retries * 500
    }
  },
  password: process.env.REDIS_PASSWORD,
  username: 'default'
})

redisClient.on('connect', () => console.log('Redis connected...'))
redisClient.on('error', (err) => console.error('Redis error:', err))


const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
}

await connectRedis() 

export default redisClient