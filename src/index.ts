import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { CronJob } from 'cron';
import fastify from 'fastify';
import { checkAndCloseRounds, checkAndCreateRounds } from './bg-sync';
import { supabase } from './config';
import { startContractEventListener } from './contract-event-listener';
import { signatureVerificationPlugin } from './middleware/signatureVerification';
import zodSchemaPlugin from './plugins/zodSchema';
import { agentRoutes } from './routes/agentRoutes';
import { messagesRoutes } from './routes/messageRoutes';
import { roomRoutes } from './routes/roomRoutes';
import { roundRoutes } from './routes/roundRoutes';
import { roundService } from './services/roundService';
import { setupWebSocketServer } from './ws/server';

// Add type declaration for the custom property
declare module 'fastify' {
  interface FastifyRequest {
    verifiedAddress: string;
  }
}

const server = fastify({
  logger: true,
});

const HARDCODED_ROOM_ID = parseInt(process.env.HARDCODED_ROOM_ID || '17');

// Register core plugins
server.register(cors, {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  origin: '*',
});
server.register(zodSchemaPlugin);
server.register(websocket);

// Register all routes with proper organization
server.register(async function (fastify) {
  // Base routes
  fastify.get('/', async () => ({ hello: 'world' }));
  fastify.get('/ping', async () => 'pong\n');

  // Protected route example
  fastify.post(
    '/protected-hello',
    {
      preHandler: signatureVerificationPlugin,
    },
    async (request, reply) => {
      const body = request.body as any;
      return {
        message: 'Hello, verified user!',
        account: body.account,
        data: body.data,
      };
    }
  );

  // Fix: Update route registration to avoid conflicts
  fastify.register(roomRoutes, { prefix: '/rooms' });
  fastify.register(agentRoutes, { prefix: '/agents' });
  fastify.register(messagesRoutes, { prefix: '/messages' });
  fastify.register(roundRoutes, { prefix: '/rooms/:roomId/rounds' });
});

// Register WebSocket handler
(async () => await setupWebSocketServer(server))();

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await server.listen({ host: '0.0.0.0', port });
    console.log(`Server listening on http://0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

(async () => {
  const { data: rooms, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('active', true)

  if (roomError) {
    console.error('Error fetching rooms:', roomError);
    return;
  }

  const roomsToStart =
    process.env.NODE_ENV === 'development'
      ? rooms.filter((room) => room.id === HARDCODED_ROOM_ID)
      : rooms;

  roomsToStart.forEach((room) => {
    console.log('Starting contract event listener for room:', room.id);
    startContractEventListener(room.id).catch(console.error);
  });
})();

const job = new CronJob('*/20 * * * * *', checkAndCreateRounds);
job.start();
const job2 = new CronJob('*/10 * * * * *', checkAndCloseRounds);
job2.start();
// const job3 = new CronJob('*/15 * * * * *', syncAgentsWithActiveRounds);
// job3.start();

//TODO Below was a hack to debug a repeat loop I was getting with agentMonitorService, should be moved back to agentMonitorService
const agentMonitorService = async () => {
  try {
    // Get all rounds that need monitoring
    const { data: activeRooms, error } = await supabase
      .from('rooms')
      .select(
        `
        *,
        room_agents!inner(id, agent_id, last_message)
      `
      )
      .eq('active', true)
      .or(`last_message.is.null,last_message.lt.${new Date(Date.now() - 30000).toISOString()}`);

    if (error || !activeRooms?.length) return;

    // Process each active round
    for (const room of activeRooms) {
      // Delegates to roundController which:
      // 1. Verifies round is still active
      // 2. Calls messageHandler.processInactiveAgents
      // 3. Handles notification delivery
      await roundService.checkInactiveAgents(room.id);
    }
  } catch (error) {
    console.error('Error in agent monitor service:', error);
  }
};
const job4 = new CronJob('*/30 * * * * *', agentMonitorService);
job4.start();
