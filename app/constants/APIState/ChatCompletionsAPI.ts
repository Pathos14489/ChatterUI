import { Logger } from '@constants/Logger'
import { SamplerID } from '@constants/SamplerData'
import { AppSettings, Global } from '../GlobalValues'
import { mmkv } from 'app/constants/MMKV'

import { APIBase, APISampler } from './BaseAPI'

class ChatCompletionsAPI extends APIBase {
    samplers: APISampler[] = [
        { externalName: 'max_context_length', samplerID: SamplerID.CONTEXT_LENGTH },
        { externalName: 'max_tokens', samplerID: SamplerID.GENERATED_LENGTH },
        { externalName: 'stream', samplerID: SamplerID.STREAMING },
        
        { externalName: 'temperature', samplerID: SamplerID.TEMPERATURE },
        { externalName: 'top_p', samplerID: SamplerID.TOP_P },
        { externalName: 'top_k', samplerID: SamplerID.TOP_K },
        { externalName: 'min_p', samplerID: SamplerID.MIN_P },

        { externalName: 'tfs_z', samplerID: SamplerID.TAIL_FREE_SAMPLING },

        { externalName: 'repeat_penalty', samplerID: SamplerID.REPETITION_PENALTY },
        { externalName: 'frequency_penalty', samplerID: SamplerID.FREQUENCY_PENALTY },
        { externalName: 'presence_penalty', samplerID: SamplerID.PRESENCE_PENALTY },
        { externalName: 'typical_p', samplerID: SamplerID.TYPICAL },

        { externalName: 'mirostat', samplerID: SamplerID.MIROSTAT_MODE },
        { externalName: 'mirostat_tau', samplerID: SamplerID.MIROSTAT_TAU },
        { externalName: 'mirostat_eta', samplerID: SamplerID.MIROSTAT_ETA },
        
        { externalName: 'xtc_probability', samplerID: SamplerID.XTC_PROBABILITY },
        { externalName: 'xtc_threshold', samplerID: SamplerID.XTC_THRESHOLD },
        
        { externalName: 'dry_multiplier', samplerID: SamplerID.DRY_MULTIPLIER },
        { externalName: 'dry_allowed_length', samplerID: SamplerID.DRY_ALLOWED_LENGTH },
        { externalName: 'dry_base', samplerID: SamplerID.DRY_BASE },
        { externalName: 'dry_penalty_last_n', samplerID: SamplerID.DRY_PENALTY_LAST_N },
        { externalName: 'dry_seq_breakers', samplerID: SamplerID.DRY_SEQ_BREAKERS },
        
        { externalName: 'grammar', samplerID: SamplerID.GRAMMAR_STRING },
        { externalName: 'seed', samplerID: SamplerID.SEED },
    ]

    buildPayload = () => {
        const payloadFields = this.getSamplerFields()
        const max_length = payloadFields?.['max_context_length']
        const context = this.buildChatCompletionContext(typeof max_length === 'number' ? max_length : 0)
        const model = this.getObject(Global.ChatCompletionsModel)
        const payload = {
            ...payloadFields,
            model: model.id,
            messages: context.messages,
            response_prefill: context.buffer,
            stop: this.constructStopSequence(),
        }
        // Logger.log(`Context: ${JSON.stringify(context)}`)
        Logger.log(`Using model: ${model?.id}`)
        if (mmkv.getBoolean(AppSettings.PrintContext)) Logger.log(`Payload: ${JSON.stringify(payload)}`)
        return payload
    }

    inference = async () => {
        const endpoint = this.getString(Global.ChatCompletionsEndpoint)
        const key = this.getString(Global.ChatCompletionsKey)

        Logger.log(`Using endpoint: Chat Completions`)
        this.readableStreamResponse(
            new URL('v1/chat/completions', endpoint).toString(),
            JSON.stringify(this.buildPayload()),
            (item) => {
                console.log(item)
                const output = JSON.parse(item)
                return output?.choices?.[0]?.text ?? output?.choices?.[0]?.delta?.content ?? output?.content ?? ''
            },
            () => {},
            { Authorization: `Bearer ${key}` }
        )
    }
}

const chatCompletionsAPI = new ChatCompletionsAPI()
export default chatCompletionsAPI
