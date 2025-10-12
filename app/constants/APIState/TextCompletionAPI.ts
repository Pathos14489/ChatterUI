import { OpenAIModel } from '@components/Endpoint/OpenAI'
import { Global } from '@constants/GlobalValues'
import { Logger } from 'app/constants/Logger'
import { SamplerID } from 'app/constants/SamplerData'

import { APIBase, APISampler } from './BaseAPI'

class TextCompletionAPI extends APIBase {
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
        const length = payloadFields?.['max_context_length']
        const model = this.getObject(Global.CompletionsModel) as OpenAIModel

        return {
            ...payloadFields,
            model: model.id,
            prompt: this.buildTextCompletionContext(typeof length === 'number' ? length : 0),
            stop: this.constructStopSequence(),
        }
    }
    inference = async () => {
        const endpoint = this.getString(Global.CompletionsEndpoint)
        const key = this.getString(Global.CompletionsKey)

        Logger.log(`Using endpoint: Text Completions`)
        this.readableStreamResponse(
            new URL('v1/completions', endpoint).toString(),
            JSON.stringify(this.buildPayload()),
            (item) => {
                const output = JSON.parse(item)
                Logger.log(JSON.stringify(output))
                return output?.choices?.[0]?.text ?? output?.content ?? ''
            },
            () => {},
            { Authorization: `Bearer ${key}` }
        )
    }
}

const textCompletionAPI = new TextCompletionAPI()
export default textCompletionAPI
