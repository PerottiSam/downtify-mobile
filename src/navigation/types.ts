import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ServerInfo } from '../api/client';

export type AuthParams = {
  Connect: undefined;
  SignIn: { baseUrl: string; info: ServerInfo };
};

export type RootParams = {
  Tabs: undefined;
  TrackList: { title: string; subtitle?: string; trackIds: string[]; coverTrackId?: string };
  Player: undefined;
};

export type Nav = NativeStackNavigationProp<RootParams>;
