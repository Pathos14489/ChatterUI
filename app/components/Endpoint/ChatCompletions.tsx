import { FontAwesome, MaterialIcons } from '@expo/vector-icons'
import { Global, Logger, Style } from '@globals'
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native'
import { Dropdown } from 'react-native-element-dropdown'
import { useMMKVObject, useMMKVString } from 'react-native-mmkv'

import HeartbeatButton from './HeartbeatButton'
import { OpenAIModel } from './OpenAI'

const ChatCompletions = () => {
    const [endpoint, setEndpoint] = useMMKVString(Global.ChatCompletionsEndpoint)
    const [chatCompletionsKey, setChatCompletionsKey] = useMMKVString(Global.ChatCompletionsKey)
    const [chatCompletionsModel, setChatCompletionsModel] = useMMKVObject<OpenAIModel>(
        Global.ChatCompletionsModel
    )
    const [keyInput, setKeyInput] = useState('')

    const [modelList, setModelList] = useState<OpenAIModel[]>([])

    useEffect(() => {
        getModelList()
    }, [])

    const getModelList = async () => {
        if (!endpoint) return

        try {
            const url = new URL('v1/models', endpoint).toString()

            const response = await fetch(url, {
                headers: {
                    accept: 'application/json',
                    Authorization: `Bearer ${chatCompletionsKey}`,
                },
            })
            if (response.status !== 200) {
                Logger.log(`Error with response: ${response.status}`, true)
                return
            }
            const { data } = await response.json()
            setModelList(data)
        } catch (e) {
            setModelList([])
        }
    }

    return (
        <View style={styles.mainContainer}>
            <Text style={styles.title}>API Key</Text>
            <Text style={styles.subtitle}>Key will not be shown</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                    style={styles.input}
                    value={keyInput}
                    onChangeText={setKeyInput}
                    placeholder="Press save to confirm key"
                    placeholderTextColor={Style.getColor('primary-text2')}
                    secureTextEntry
                />
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                        if (keyInput === '') {
                            Logger.log('No key entered!', true)
                            return
                        }
                        setChatCompletionsKey(keyInput)
                        setKeyInput('')
                        Logger.log('Key saved!', true)
                    }}>
                    <FontAwesome name="save" color={Style.getColor('primary-text1')} size={28} />
                </TouchableOpacity>
            </View>

            <Text style={styles.title}>Endpoint</Text>
            <Text style={styles.subtitle}>
                This endpoint should be cross compatible with many different services. Be sure to
                end with ' / '
            </Text>
            <TextInput
                style={styles.input}
                value={endpoint}
                onChangeText={(value) => {
                    setEndpoint(value)
                }}
                placeholder="eg. https://127.0.0.1:5000"
                placeholderTextColor={Style.getColor('primary-text2')}
            />

            {endpoint && (
                <HeartbeatButton
                    api={endpoint}
                    headers={{ Authorization: `Bearer ${chatCompletionsKey}` }}
                />
            )}

            <View style={styles.dropdownContainer}>
                <Text style={styles.title}>Models</Text>

                <Text style={styles.subtitle}>API Key must be provided to get model list.</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Dropdown
                        value={chatCompletionsModel}
                        data={modelList}
                        labelField="id"
                        valueField="id"
                        onChange={(item: OpenAIModel) => {
                            if (item.id === chatCompletionsModel?.id) return
                            setChatCompletionsModel(item)
                        }}
                        {...Style.drawer.default}
                        placeholder={
                            modelList.length === 0 ? 'No Models Available' : 'Select Model'
                        }
                    />
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => {
                            getModelList()
                        }}>
                        <MaterialIcons
                            name="refresh"
                            color={Style.getColor('primary-text1')}
                            size={28}
                        />
                    </TouchableOpacity>
                </View>
            </View>
            {chatCompletionsModel?.id && (
                <View style={styles.modelInfo}>
                    <Text style={{ ...styles.title, marginBottom: 8 }}>
                        {chatCompletionsModel.id}
                    </Text>
                    <View style={{ flexDirection: 'row' }}>
                        <View>
                            <Text style={{ color: Style.getColor('primary-text2') }}>Id</Text>
                            <Text style={{ color: Style.getColor('primary-text2') }}>Object</Text>
                            <Text style={{ color: Style.getColor('primary-text2') }}>Owned By</Text>
                        </View>
                        <View style={{ marginLeft: 8 }}>
                            <Text style={{ color: Style.getColor('primary-text2') }}>
                                : {chatCompletionsModel.id}
                            </Text>
                            <Text style={{ color: Style.getColor('primary-text2') }}>
                                : {chatCompletionsModel.object}
                            </Text>
                            <Text style={{ color: Style.getColor('primary-text2') }}>
                                : {chatCompletionsModel.owned_by}
                            </Text>
                        </View>
                    </View>
                </View>
            )}
        </View>
    )
}

export default ChatCompletions

const styles = StyleSheet.create({
    mainContainer: {
        marginVertical: 16,
        paddingVertical: 16,
        paddingHorizontal: 20,
    },

    title: {
        paddingTop: 8,
        color: Style.getColor('primary-text1'),
        fontSize: 16,
    },

    subtitle: {
        color: Style.getColor('primary-text2'),
    },

    input: {
        flex: 1,
        color: Style.getColor('primary-text1'),
        borderColor: Style.getColor('primary-brand'),
        borderWidth: 1,
        paddingVertical: 4,
        paddingHorizontal: 8,
        marginVertical: 8,
        borderRadius: 8,
    },

    button: {
        padding: 5,
        borderColor: Style.getColor('primary-brand'),
        borderWidth: 1,
        borderRadius: 4,
        marginLeft: 8,
    },

    dropdownContainer: {
        marginTop: 16,
    },

    modelInfo: {
        borderRadius: 8,
        backgroundColor: Style.getColor('primary-surface2'),
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
    },
})
