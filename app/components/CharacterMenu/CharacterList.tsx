import { Characters, Logger } from '@globals'
import { useRouter, Stack, usePathname } from 'expo-router'
import { useEffect, useState } from 'react'
import { SafeAreaView, ScrollView, TextInput, View, StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { Style } from '@globals'

import CharacterListing from './CharacterListing'
import CharacterNewMenu from './CharacterNewMenu'
import CharactersEmpty from './CharactersEmpty'

type CharInfo = {
    name: string
    id: number
    image_id: number
    tags: string[]
}

const CharacterList = () => {
    const router = useRouter()

    const [characterList, setCharacterList] = useState<CharInfo[]>([])
    const [nowLoading, setNowLoading] = useState(false)
    const [searchText, setSearchText] = useState('')

    const goBack = () => router.back()

    const gesture = Gesture.Fling()
        .direction(1)
        .onEnd(() => {
            runOnJS(goBack)()
        })

    const getCharacterList = async () => {
        try {
            const list = await Characters.db.query.cardList('character')
            setCharacterList(list)
        } catch (error) {
            Logger.log(`Could not retrieve characters.\n${error}`, true)
        }
    }

    const filteredCharacters = characterList.filter(
        c =>
            c.name.toLowerCase().includes(searchText.toLowerCase()) ||
            c.tags.some(tag => tag.toLowerCase().includes(searchText.toLowerCase()))
    )

    useEffect(() => {
        getCharacterList()
    }, [usePathname()])

    return (
        <GestureDetector gesture={gesture}>
            <SafeAreaView style={{ paddingVertical: 16, paddingHorizontal: 8, flex: 1 }}>
                <Stack.Screen
                    options={{
                        title: 'Characters',
                        headerRight: () => (
                            <CharacterNewMenu
                                nowLoading={nowLoading}
                                setNowLoading={setNowLoading}
                                getCharacterList={getCharacterList}
                            />
                        ),
                    }}
                />
                {/* Search Bar */}
                <View style={styles.searchBox}>
                    <TextInput
                        placeholder="Search characters..."
                    style={styles.searchInput}
                    value={searchText}
                    onChangeText={setSearchText}
                    />
                    <FontAwesome
                        name="search"
                        size={15}
                        color={Style.getColor('primary-text1')}
                    />
                </View>
                {filteredCharacters.length === 0 && <CharactersEmpty />}
                {filteredCharacters.length !== 0 && (
                    <ScrollView>
                        {filteredCharacters.reverse().map((character, index) => (
                            <CharacterListing
                                key={character.id}
                                index={index}
                                character={character}
                                nowLoading={nowLoading}
                                setNowLoading={setNowLoading}
                            />
                        ))}
                    </ScrollView>
                )}
            </SafeAreaView>
        </GestureDetector>
    )
}

const styles = StyleSheet.create({
    searchBox: {
        flex: 1,
        borderRadius: 16,
        backgroundColor: Style.getColor('primary-surface2'),
        padding: 8,
        color: Style.getColor('primary-text1'),
        flexDirection: 'row',
        alignItems: 'center',
    },

    searchInput: {
        flex: 1,
        color: Style.getColor('primary-text1'),
    }
})

export default CharacterList
