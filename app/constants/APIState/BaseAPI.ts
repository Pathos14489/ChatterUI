import { AppSettings, Global } from '@constants/GlobalValues'
import { Llama } from '@constants/LlamaLocal'
import { Tokenizer } from '@constants/Tokenizer'
import { API } from '@globals'
import { Characters } from 'app/constants/Characters'
import { Chats, useInference } from 'app/constants/Chat'
import { InstructType, Instructs } from 'app/constants/Instructs'
import { Logger } from 'app/constants/Logger'
import { mmkv } from 'app/constants/MMKV'
import { replaceMacros } from 'app/constants/Utils'
import EventSource from 'react-native-sse'

import { SamplerID, Samplers, SamplerPreset } from '../SamplerData'

export type APISampler = {
    samplerID: SamplerID
    externalName: string
}

export interface IAPIBase {
    samplers: APISampler[]
    buildPayload: () => any
    getSamplerFields: (max_length?: number) => any
    inference: () => Promise<void>
}

export abstract class APIBase implements IAPIBase {
    samplers: APISampler[] = []
    buildPayload = () => {}
    getSamplerFields = (max_length?: number) => {
        //TODO: Get From Preset and construct
        const data = mmkv.getString(Global.PresetData)
        if (!data) return
        const preset: SamplerPreset = JSON.parse(data)
        return [...this.samplers]
            .map((item: APISampler) => {
                const value = preset[item.samplerID]
                const samplerItem = Samplers[item.samplerID]
                let cleanvalue = value
                if (typeof value === 'number')
                    if (item.samplerID === 'max_length' && max_length) {
                        cleanvalue = Math.min(value, max_length)
                    } else if (samplerItem.values.type === 'integer') cleanvalue = Math.floor(value)
                return { [item.externalName as SamplerID]: cleanvalue }
            })
            .reduce((acc, obj) => Object.assign(acc, obj), {})
    }
    inference = async () => {}

    constructStopSequence = (): string[] => {
        const instruct = Instructs.useInstruct.getState().replacedMacros()
        const sequence: string[] = []
        if (instruct.stop_sequence !== '')
            instruct.stop_sequence.split(',').forEach((item) => item !== '' && sequence.push(item))
        return sequence
    }

    getLoreBookIndex = (characterCard: any) => {
        const lorebook = characterCard?.data?.character_book
        if (!lorebook) return {}
        let index: { [key: string]: any } = {}
        lorebook.entries.forEach((entry:any) => {
            if (!entry.enabled) return
            entry.keys.forEach((key:string) => {
                index[key.toLowerCase()] = entry
            })
            entry.secondary_keys?.forEach((key:string) => {
                index[key.toLowerCase()] = entry
            })
        })
        return index
    }

    buildTextCompletionContext = (max_length: number) => {
        const delta = performance.now()

        const tokenizer =
            mmkv.getString(Global.APIType) === API.LOCAL
                ? Llama.useLlama.getState().tokenLength
                : Tokenizer.useTokenizer.getState().getTokenCount

        const messages = [...(Chats.useChat.getState().data?.messages ?? [])]

        const currentInstruct = Instructs.useInstruct.getState().replacedMacros()

        const userCard = { ...Characters.useUserCard.getState().card }
        const currentCard = { ...Characters.useCharacterCard.getState().card }
        const userName = userCard.data?.name ?? ''
        const charName = currentCard.data?.name ?? ''

        const characterCache = Characters.useCharacterCard.getState().getCache(userName)
        const userCache = Characters.useUserCard.getState().getCache(charName)
        const instructCache = Instructs.useInstruct.getState().getCache(charName, userName)

        const user_card_description = (userCard?.data?.description ?? '').trim()
        const char_card_description  = (currentCard?.data?.description ?? '').trim()
        const char_card_personality = (currentCard?.data?.personality ?? '').trim()
        const char_card_scenario = (currentCard?.data?.scenario ?? '').trim()
        const char_card_post_history_instructions = (currentCard?.data?.post_history_instructions ?? '').trim()
        let payload = ``

        // set suffix length as its always added
        let payload_length = instructCache.system_suffix_length
        if (currentInstruct.system_prefix) {
            payload += currentInstruct.system_prefix
            payload_length += instructCache.system_prefix_length
        }

        if (currentInstruct.system_prompt) {
            payload += `${currentInstruct.system_prompt}`
            payload_length += instructCache.system_prompt_length
        }
        if (char_card_description) {
            payload += `\n${char_card_description}`
            payload_length += characterCache.description_length
        }
        if (char_card_personality) {
            payload += `\n${char_card_personality}`
            payload_length += characterCache.personality_length
        }
        if (char_card_scenario) {
            payload += `\n${char_card_scenario}`
            payload_length += characterCache.scenario_length
        }
        if (char_card_post_history_instructions) {
            // Added at the end.
            payload_length += characterCache.post_history_instructions_length
        }
        if (user_card_description) {
            payload += `\n${user_card_description}`
            payload_length += userCache.description_length
        }
        // suffix must be delayed for example messages
        let message_acc = ``
        let message_acc_length = 0
        let is_last = true
        let index = messages.length - 1

        const wrap_string = `\n`
        const wrap_length = currentInstruct.wrap ? tokenizer(wrap_string) : 0

        // we use this to check if the first message is reached
        // this is needed to check if examples should be added
        let first_message_reached = false

        // we require lengths for names if use_names is enabled
        for (const message of messages.reverse()) {
            const swipe_len = Chats.useChat.getState().getTokenCount(index)
            const swipe_data = message.swipes[message.swipe_id]

            /** Accumulate total string length
             *  The context builder MUST retain context length below the
             *  context limit, especially for local gens to prevent truncation
             * **/

            let instruct_len = message.is_user ? instructCache.input_prefix_length : instructCache.output_suffix_length

            // for last message, we want to skip the end token to allow the LLM to generate

            if (!is_last) instruct_len += message.is_user ? instructCache.input_suffix_length : instructCache.output_suffix_length

            const timestamp_string = `[${swipe_data.send_date.toString().split(' ')[0]} ${swipe_data.send_date.toLocaleTimeString()}]\n`
            const timestamp_length = currentInstruct.timestamp ? tokenizer(timestamp_string) : 0

            const name_string = `${message.name} :`
            const name_length = currentInstruct.names ? tokenizer(name_string) : 0

            const shard_length = swipe_len + instruct_len + name_length + timestamp_length + wrap_length

            // check if within context window

            if (message_acc_length + payload_length + shard_length > max_length) {
                break
            }

            // apply strings

            let message_shard = `${message.is_user ? currentInstruct.input_prefix : currentInstruct.output_prefix}`

            if (currentInstruct.timestamp) message_shard += timestamp_string

            if (currentInstruct.names) message_shard += name_string

            message_shard += swipe_data.swipe

            if (!is_last) {
                message_shard += `${message.is_user ? currentInstruct.input_suffix : currentInstruct.output_suffix}`
            }

            if (currentInstruct.wrap) {
                message_shard += wrap_string
            }

            first_message_reached = index === 0

            // ensure no more is_last checks after this
            is_last = false
            message_acc_length += shard_length
            message_acc = message_shard + message_acc
            // if (index === messages.length - 1) { // very first message, add suffix length TODO: redo text prompt construction to be more like my message_formatter class in py and fix this later
            //     // Add post history instructions if exists
            //     if (char_card_post_history_instructions) {
            //         message_acc += `\n${char_card_post_history_instructions}`
            //         message_acc_length += characterCache.post_history_instructions_length
            //     }
            // }
            index--
        }

        const examples = currentCard.data?.mes_example
        if (first_message_reached && currentInstruct.examples && examples && message_acc_length + payload_length + characterCache.examples_length < max_length) {
            payload += examples
            message_acc_length += characterCache.examples_length
        }

        payload += currentInstruct.system_suffix

        payload = replaceMacros(payload + message_acc)
        Logger.log(`Approximate Context Size: ${message_acc_length + payload_length} tokens`)
        Logger.log(`${(performance.now() - delta).toFixed(2)}ms taken to build context`)
        if (mmkv.getBoolean(AppSettings.PrintContext)) Logger.log(payload)

        return payload
    }

    buildChatCompletionContext = (
        max_length: number,
        systemRole = 'system',
        userRole = 'user',
        assistantRole = 'assistant',
        contentName = 'content'
    ) => {
        const startTime = performance.now()
        const tokenizer = mmkv.getString(Global.APIType) === API.LOCAL ? Llama.useLlama.getState().tokenLength : Tokenizer.useTokenizer.getState().getTokenCount

        const messages = [...(Chats.useChat.getState().data?.messages ?? [])]


        const currentInstruct = Instructs.useInstruct.getState().replacedMacros()

        const userCard = { ...Characters.useUserCard.getState().card }
        const currentCard = { ...Characters.useCharacterCard.getState().card }
        const userName = userCard.data?.name ?? ''
        const charName = currentCard.data?.name ?? ''
        Logger.log(`Building chat context for ${charName}: ${currentCard}`)

        const characterCache = Characters.useCharacterCard.getState().getCache(userName)
        const userCache = Characters.useUserCard.getState().getCache(charName)
        const instructCache = Instructs.useInstruct.getState().getCache(charName, userName)

        const user_card_description = (userCard?.data?.description ?? '').trim()
        const char_card_description  = (currentCard?.data?.description ?? '').trim()
        const char_card_personality = (currentCard?.data?.personality ?? '').trim()
        const char_card_scenario = (currentCard?.data?.scenario ?? '').trim()
        const char_card_post_history_instructions = (currentCard?.data?.post_history_instructions ?? '').trim()
        // set suffix length as its always added

        let buffer = Chats.useChat.getState().buffer
        if (currentInstruct.timestamp) {
            const timestamp_string = `[${new Date().toString().split(' ')[0]} ${new Date().toLocaleTimeString()}] `
            buffer = timestamp_string + buffer
        }

        if (currentInstruct.names) {
            const name_string = `${currentCard.data?.name}: `
            buffer = name_string + buffer
        }
        // Add buffer to length
        let buffer_length = tokenizer(buffer)

        Logger.log(`Current buffer length: ${tokenizer(buffer)}, buffer: ${buffer}`)

        // Logic here is that if the buffer is empty, this is not a regen, hence can popped
        // if (!buffer) 
        Logger.log("Removed message: "+messages.pop())

        let initial_content = ""
        let payload_length = instructCache.system_prompt_length + buffer_length
        if (currentInstruct.system_prompt) {
            initial_content += `${currentInstruct.system_prompt}`
            payload_length += characterCache.description_length
        }
        if (char_card_description) {
            initial_content += `\n${char_card_description}`
            payload_length += characterCache.description_length
        }
        if (char_card_personality) {
            initial_content += `\n${char_card_personality}`
            payload_length += characterCache.personality_length
        }
        if (char_card_scenario) {
            initial_content += `\n${char_card_scenario}`
            payload_length += characterCache.scenario_length
        }
        if (char_card_post_history_instructions) {
            // Added at the end.
            payload_length += characterCache.post_history_instructions_length
        }
        if (user_card_description) {
            initial_content += `\n${user_card_description}`
            payload_length += userCache.description_length
        }
        const initial_message = { role: systemRole, content: replaceMacros(initial_content.trim()) }
        
        let payload = [initial_message]
        const messageBuffer: { role: string; content: string }[] = []
        const lorebookBuffer: { role: string; content: string }[] = []
        let lorebookBudget = currentCard.data?.character_book?.token_budget ?? 0

        let index = messages.length - 1
        for (const message of messages.reverse()) {
            const swipe_len = Chats.useChat.getState().getTokenCount(index)
            const swipe_data = message.swipes[message.swipe_id]

            let message_content = ""
            let shard_len = 0

            if (currentInstruct.timestamp) {
                const timestamp_string = `[${swipe_data.send_date.toString().split(' ')[0]} ${swipe_data.send_date.toLocaleTimeString()}] `
                const timestamp_length = currentInstruct.timestamp ? tokenizer(timestamp_string) : 0
                message_content += timestamp_string
                shard_len += timestamp_length
            }

            if (currentInstruct.names) {
                const name_string = `${message.name}: `
                const name_length = currentInstruct.names ? tokenizer(name_string) : 0
                message_content += name_string
                shard_len += name_length
            }

            message_content += replaceMacros(message.swipes[message.swipe_id].swipe)
            shard_len += swipe_len

            if (shard_len > max_length) break
            payload_length += shard_len
            // if lorebook exists, we check for keys in the message
            if (lorebookBudget > 0 && currentCard.data?.character_book) {
                const loreIndex = this.getLoreBookIndex(currentCard)
                Object.keys(loreIndex).forEach((key) => {
                    if (message_content.toLowerCase().includes(key)) {
                        const entry = loreIndex[key]
                        const entry_length = tokenizer(entry.content)
                        if (entry_length <= lorebookBudget && entry_length + payload_length <= max_length) {
                            lorebookBuffer.push({
                                role: systemRole,
                                content: replaceMacros(entry.content),
                            }) // TODO: Use entry settings to modify position 
                            lorebookBudget -= entry_length
                            payload_length += entry_length
                            Logger.log(`Added lorebook entry for key: ${key}`)
                        }
                    }
                })
            }
            messageBuffer.push({
                role: message.is_user ? userRole : assistantRole,
                content: message_content,
            })
            index--
        }

        Logger.log(`Final context length: ${payload_length}, max allowed: ${max_length}`)
        // construct final payload
        // lorebook entries always first
        // then messages
        // then buffer
        Logger.log(`Added ${lorebookBuffer.length} lorebook entries, ${messageBuffer.length} messages`)
        
        lorebookBuffer.reverse().forEach((item) => payload.push(item))
        messageBuffer.reverse().forEach((item, index) => {
            // if last message, add post_history_instructions before it if exists
            if (index === messageBuffer.length - 1 && char_card_post_history_instructions.trim() !== '') {
                payload.push({
                    role: systemRole,
                    content: replaceMacros(char_card_post_history_instructions.trim()),
                })
            }
            payload.push(item)
        })

        // if (mmkv.getBoolean(AppSettings.PrintContext)) Logger.log(JSON.stringify(payload))
        Logger.log(`Approximate Context Size: ${payload_length} tokens | ${(performance.now() - startTime).toFixed(2)}ms taken to build context`)
        return {
            messages: payload,
            buffer: buffer,
        }
    }

    readableStreamResponse = async (
        endpoint: string,
        payload: string,
        jsonreader: (event: any) => string,
        abort_func = () => {},
        header: KeyHeader = {}
    ) => {
        const replace = RegExp(
            this.constructReplaceStrings()
                .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join(`|`),
            'g'
        )

        const es = new EventSource(endpoint, {
            method: 'POST',
            body: payload,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                ...header,
            },
            pollingInterval: 0,
            withCredentials:
                header?.['X-API-KEY'] !== undefined || header?.Authorization !== undefined,
        })

        const closeStream = () => {
            Logger.debug('Running close stream')
            this.stopGenerating()
            es.removeAllEventListeners()
            es.close()
        }

        useInference.getState().setAbort(async () => {
            Logger.debug('Running abort')
            closeStream()
            abort_func()
        })

        es.addEventListener('message', (event) => {
            if (event.data === `[DONE]`) {
                es.close()
                return
            }
            const text = jsonreader(event.data) ?? ''
            const output = Chats.useChat.getState().buffer + text
            Chats.useChat.getState().setBuffer(output.replaceAll(replace, ''))
        })

        es.addEventListener('error', (event) => {
            if ('message' in event) {
                Logger.log('Generation Failed. Check Logs', true)
                Logger.log(`An error occured : ${event?.message ?? ''}`)
            }
            closeStream()
        })
        es.addEventListener('close', (event) => {
            closeStream()
            Logger.log('EventSource closed')
        })
    }

    constructReplaceStrings = (): string[] => {
        const currentInstruct: InstructType = Instructs.useInstruct.getState().replacedMacros()
        // default stop strings defined instructs
        const stops: string[] = this.constructStopSequence()
        // additional stop strings based on context configuration
        const output: string[] = []

        if (currentInstruct.names) {
            const userName = Characters.useCharacterCard.getState().card?.data.name ?? ''
            const charName: string = Characters.useCharacterCard.getState()?.card?.data?.name ?? ''
            output.push(`${userName} :`)
            output.push(`${charName} :`)
        }
        return [...stops, ...output]
    }

    getObject = (key: string) => {
        return JSON.parse(mmkv.getString(key) ?? '{}')
    }
    getString = (key: string) => {
        return mmkv.getString(key) ?? ''
    }
    stopGenerating = () => {
        Chats.useChat.getState().stopGenerating()
    }
}

type KeyHeader = {
    [key: string]: string
}
