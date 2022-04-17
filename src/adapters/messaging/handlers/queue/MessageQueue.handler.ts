import { ChannelNameEnum } from "../../../../application/shared/messaging/ChannelName.enum";
import { IEventQueue } from "../../../../application/shared/messaging/queue/IEventQueue";
import { BaseUseCase } from "../../../../application/shared/useCase/BaseUseCase";
import { BooleanUtil } from "../../../../domain/shared/utils/BooleanUtil";
import { IMessageQueueHandler, QueueArgs } from "./IMessageQueue.handler";
import { IServiceContainer } from "../../../shared/dic/IServiceContainer";
import { NumberUtil } from "../../../../domain/shared/utils/NumberUtil";
import { TypeParser } from "../../../../domain/shared/utils/TypeParser";
import queueMessageUseCaseContainer from "./container";

export class MessageQueueHandler implements IMessageQueueHandler {
  private readingChannels: ChannelNameEnum[] = [];
  private eventQueue: IEventQueue | undefined;
  private queueNameToUseCaseMap: Map<string, string>;

  constructor(private readonly messageQueueUseCasesContainer: IServiceContainer) {
    this.queueNameToUseCaseMap = new Map();
  }

  setEventQueue(eventQueue: IEventQueue): void {
    this.eventQueue = eventQueue;
  }

  setUseCasesContext(useCasesContext: Record<string, string>): void {
    Object.keys(useCasesContext).forEach((channelNameTopic) => {
      this.queueNameToUseCaseMap.set(channelNameTopic, useCasesContext[channelNameTopic]);
    });
  }

  async handle(args: QueueArgs): Promise<void> {
    if (!this.validateRequest(args)) return Promise.resolve();

    if (this.isChannelReading(args.queueName)) return Promise.resolve();

    if (!this.queueNameToUseCaseMap) {
      console.error(MessageQueueHandler.name, "Queue name to use case map is not set");
      return Promise.resolve();
    }

    this.readingChannels.push(args.queueName);

    try {
      return this.messageQueueUseCasesContainer
        .get<BaseUseCase<IEventQueue>>(
          this.queueNameToUseCaseMap.get(
            TypeParser.cast<ChannelNameEnum>(`${args.queueName}:${args.topicName}`),
          ) as string,
        )
        .execute(this.eventQueue)
        .then((_result) => {
          this.removeChannel(args.queueName);
          return Promise.resolve();
        })
        .catch((error) => {
          this.removeChannel(args.queueName);
          console.error(MessageQueueHandler.name, new Date().toISOString(), error);
          return Promise.resolve();
        });
    } catch (error) {
      console.error(MessageQueueHandler.name, error);
      this.removeChannel(args.queueName);
      return Promise.resolve();
    }
  }

  private validateRequest(args: QueueArgs): boolean {
    if (!args.queueName && !args.topicName) {
      console.error(MessageQueueHandler.name, "Invalid queue request");
      return BooleanUtil.NOT;
    }
    return BooleanUtil.YES;
  }

  private isChannelReading(channel: ChannelNameEnum): boolean {
    return this.readingChannels.includes(channel);
  }

  private removeChannel(channel: ChannelNameEnum): void {
    this.readingChannels.splice(this.readingChannels.indexOf(channel), NumberUtil.DELETE_ONE);
  }
}

export default new MessageQueueHandler(queueMessageUseCaseContainer);
