import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Trophy, User, Users, Sparkles } from 'lucide-react-native';
import { View } from 'react-native';

export default function TabLayout() {
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
          title: 'Summary',
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
        name="social"
        options={{
          title: 'Activity',
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
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
