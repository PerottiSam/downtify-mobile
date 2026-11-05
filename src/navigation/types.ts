import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ServerInfo } from '../api/client';

export type AuthParams = {
  Connect: undefined;
  SignIn: { baseUrl: string; info: ServerInfo };
};

/** Stack radice: tab bar + player a schermo intero (modale). */
export type RootParams = {
  Tabs: undefined;
  Player: undefined;
};

/** Stack interno di ogni tab: le pagine di dettaglio si aprono QUI, sotto la tab bar. */
export type TabStackParams = {
  Home: undefined;
  TrackList: { title: string; subtitle?: string; trackIds: string[]; coverTrackId?: string };
};

export type Nav = NativeStackNavigationProp<TabStackParams>;
