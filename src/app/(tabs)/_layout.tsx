import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Label, Icon } from 'expo-router/unstable-native-tabs';
import { Home, Trophy, User, Users, Sparkles } from 'lucide-react-native';

export default function TabLayout() {
  // Use native tabs on iOS for liquid glass effect on iOS 26+
  if (Platform.OS === 'ios') {
    return (
      <NativeTabs
        tabBarActiveTintColor="#FA114F"
      >
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: 'house', selected: 'house.fill' }} />
          <Label>Home</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="social">
          <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
          <Label>Friends</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="compete">
          <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
          <Label>Compete</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="coach">
          <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
          <Label>Coach</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: 'person', selected: 'person.fill' }} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>

        {/* Hidden screens - use href={null} equivalent by not adding a Trigger */}
      </NativeTabs>
    );
  }

  // Fallback to regular tabs on Android
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FA114F',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                padding: 5,
                borderRadius: 10,
                backgroundColor: focused ? 'rgba(250, 17, 79, 0.15)' : 'transparent',
              }}
            >
              <Home size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                padding: 5,
                borderRadius: 10,
                backgroundColor: focused ? 'rgba(250, 17, 79, 0.15)' : 'transparent',
              }}
            >
              <Users size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="compete"
        options={{
          title: 'Compete',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                padding: 5,
                borderRadius: 10,
                backgroundColor: focused ? 'rgba(250, 17, 79, 0.15)' : 'transparent',
              }}
            >
              <Trophy size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarActiveTintColor: '#92E82A',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                padding: 5,
                borderRadius: 10,
                backgroundColor: focused ? 'rgba(146, 232, 42, 0.15)' : 'transparent',
              }}
            >
              <Sparkles size={20} color={focused ? '#92E82A' : color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                padding: 5,
                borderRadius: 10,
                backgroundColor: focused ? 'rgba(250, 17, 79, 0.15)' : 'transparent',
              }}
            >
              <User size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen
        name="awards"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
