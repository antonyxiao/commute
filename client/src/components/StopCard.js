import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

cssInterop(Animated.View, { className: 'style' });

const EXPANDED_HEIGHT = 400;
const COLLAPSED_HEIGHT = 60;
const ITEM_HEIGHT = 60;

export default function StopCard({ stop, arrivals, vehicles, loading, onClose, onArrivalPress, selectedDate, onDateChange, isCollapsed, setIsCollapsed }) {
  // const [selectedDirection, setSelectedDirection] = useState(null); // Removed direction state
  const [manualTime, setManualTime] = useState(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [timeAgo, setTimeAgo] = useState('Just now');
  const flatListRef = useRef(null);
  
  const cardHeight = useSharedValue(isCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: withTiming(isCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT, {
        duration: 300,
        easing: Easing.inOut(Easing.quad),
      }),
    };
  });

  // Reset manual time when resetting to "Current" (date becomes null)
  useEffect(() => {
      if (selectedDate === null) {
          setManualTime(null);
      }
  }, [selectedDate]);

  // Reset expanded state when stop changes
  useEffect(() => {
    setIsCollapsed(false);
  }, [stop]);

  // Update lastUpdated timestamp when arrivals data changes
  useEffect(() => {
    setLastUpdated(new Date());
    setTimeAgo('Just now');
  }, [arrivals]);

  // Update "time ago" text every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
        const now = new Date();
        const diffInSeconds = Math.floor((now - lastUpdated) / 1000);

        if (diffInSeconds < 30) {
            setTimeAgo('Just now');
        } else if (diffInSeconds < 60) {
            setTimeAgo('< 1 min ago');
        } else {
            const mins = Math.floor(diffInSeconds / 60);
            setTimeAgo(`${mins} min ago`);
        }
    }, 10000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  const filteredArrivals = useMemo(() => {
    return arrivals || [];
  }, [arrivals]);

  useEffect(() => {
    if (filteredArrivals.length > 0 && flatListRef.current) {
      // Helper to convert HH:MM to minutes from midnight for robust comparison
      const timeToMinutes = (timeString) => {
        if (!timeString) return -1; 
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
      };

      let targetComparisonMinutes; // This will be minutes from midnight for accurate comparison
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (manualTime && manualTime.length >= 4) {
          targetComparisonMinutes = timeToMinutes(manualTime);
      } else if (selectedDate) {
          // If a specific date is selected, we want to scroll to the beginning for that day
          targetComparisonMinutes = 0; // Start of the day
      } else {
          // For 'Today' (selectedDate is null), scroll to current time
          targetComparisonMinutes = currentMinutes;
      }

      let nextIndex = filteredArrivals.findIndex(a => {
        let arrivalMinutes;

        if (selectedDate === null) { // Only apply real-time consideration for 'Today'
            const rtTime = a.real_time_arrival;
            const scheduledTime = a.arrival_time;
            
            if (rtTime) {
                arrivalMinutes = timeToMinutes(rtTime);
            } else {
                arrivalMinutes = timeToMinutes(scheduledTime);
            }
            return arrivalMinutes >= currentMinutes;
        } else {
            // For specific selected dates, we simply compare against the start of the day (or manualTime)
            arrivalMinutes = timeToMinutes(a.arrival_time);
            return arrivalMinutes >= targetComparisonMinutes;
        }
      });

      // If no future stops, scroll to the last one (only for 'Today' and if all are in the past)
      if (nextIndex === -1 && filteredArrivals.length > 0 && selectedDate === null) {
          const lastArrival = filteredArrivals[filteredArrivals.length - 1];
          const lastArrivalMinutes = timeToMinutes(lastArrival.real_time_arrival || lastArrival.arrival_time);

          if (lastArrivalMinutes < currentMinutes) {
             nextIndex = filteredArrivals.length - 1; 
          }
      }
      
      if (nextIndex !== -1) {
        setTimeout(() => {
            // Ensure the FlatList is not null before trying to scroll
            flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true, viewPosition: 0 });
        }, 500);
      }
    }
  }, [filteredArrivals, manualTime, selectedDate]);

  if (!stop) return null;

  return (
    <Animated.View 
        style={[animatedStyle]}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-lg border-t border-gray-200 px-4 pt-4 overflow-hidden"
    >
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-800" numberOfLines={1}>{stop.stop_name}</Text>
          { !isCollapsed && <Text className="text-sm text-gray-500">{stop.stop_desc}</Text> }
        </View>
        <TouchableOpacity 
            onPress={() => setIsCollapsed(!isCollapsed)} 
            className="p-2 bg-gray-100 rounded-full"
        >
          <Text className="text-gray-600 font-semibold">{isCollapsed ? "Show" : "Hide"}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {/* Compact Date/Time Selector */}
        <View className="mb-4">
            {!isDatePickerOpen ? (
            <TouchableOpacity 
                onPress={() => setIsDatePickerOpen(true)}
                className="flex-row items-center justify-between bg-gray-50 py-2 px-3 rounded-lg border border-gray-200"
            >
                <View className="flex-row items-center">
                <Text className="text-gray-600 font-medium mr-2">Schedule:</Text>
                <Text className="text-blue-600 font-bold">
                    {selectedDate ? selectedDate.toDateString() : "Today"} 
                    {manualTime ? ` @ ${manualTime}` : " @ Now"}
                </Text>
                </View>
                <Text className="text-gray-400 text-sm">Edit ▼</Text>
            </TouchableOpacity>
            ) : (
            <View className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <View className="flex-row justify-between items-center mb-3">
                    <TouchableOpacity 
                        className="bg-blue-100 px-3 py-1 rounded"
                        onPress={() => {
                            const d = selectedDate ? new Date(selectedDate) : new Date();
                            d.setDate(d.getDate() - 1);
                            onDateChange(d);
                        }}
                    >
                        <Text className="text-blue-600 font-bold text-xs">&lt; Prev Day</Text>
                    </TouchableOpacity>

                    <Text className="font-bold text-gray-800 text-sm mx-2">
                        {selectedDate ? selectedDate.toDateString() : "Today"}
                    </Text>

                    <TouchableOpacity 
                        className="bg-blue-100 px-3 py-1 rounded"
                        onPress={() => {
                            const d = selectedDate ? new Date(selectedDate) : new Date();
                            d.setDate(d.getDate() + 1);
                            onDateChange(d);
                        }}
                    >
                        <Text className="text-blue-600 font-bold text-xs">Next Day &gt;</Text>
                    </TouchableOpacity>
                </View>
                
                <View className="flex-row items-center justify-between gap-3">
                    {/* Time Inputs */}
                    <View className="flex-row items-center bg-white border border-gray-300 rounded px-2 py-1">
                        <TextInput 
                            className="text-black text-center text-lg w-10 font-bold p-0"
                            placeholder="HH" 
                            placeholderTextColor="#9CA3AF"
                            maxLength={2}
                            keyboardType="number-pad"
                            onChangeText={(text) => {
                                const min = manualTime ? manualTime.split(':')[1] : '00';
                                setManualTime(`${text}:${min}`);
                            }}
                            defaultValue={manualTime ? manualTime.split(':')[0] : ''}
                        />
                        <Text className="text-gray-500 font-bold mx-1">:</Text>
                        <TextInput 
                            className="text-black text-center text-lg w-10 font-bold p-0"
                            placeholder="MM" 
                            placeholderTextColor="#9CA3AF"
                            maxLength={2}
                            keyboardType="number-pad"
                            onChangeText={(text) => {
                                const hr = manualTime ? manualTime.split(':')[0] : '00';
                                setManualTime(`${hr}:${text}`);
                            }}
                            defaultValue={manualTime ? manualTime.split(':')[1] : ''}
                        />
                    </View>

                    <View className="flex-row gap-2">
                        <TouchableOpacity 
                            className="bg-gray-200 px-4 py-2 rounded"
                            onPress={() => {
                                onDateChange(null);
                                setManualTime(null);
                            }}
                        >
                            <Text className="text-gray-700 font-bold text-sm">Now</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={() => setIsDatePickerOpen(false)}
                            className="bg-blue-600 px-4 py-2 rounded"
                        >
                            <Text className="text-white font-bold text-sm">Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            )}
        </View>
        
        <View className="flex-row justify-between items-baseline mb-2">
            <Text className="text-lg font-semibold text-gray-700">Arrivals</Text>
            <Text className="text-xs text-gray-400">Updated {timeAgo}</Text>
        </View>
        
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-gray-500 mt-2">Loading schedule...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredArrivals}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ paddingBottom: 0 }}
            getItemLayout={(data, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            renderItem={({ item: arrival }) => {
              const scheduledTime = arrival.arrival_time.substring(0, 5);
              // Check if this arrival has a corresponding vehicle
              const hasVehicle = vehicles && vehicles.some((v) => v.trip_id === arrival.trip_id);

              const Content = (
                <View className="flex-row justify-between items-center h-[60px] px-2 border-b border-gray-100">
                  <View>
                    {arrival.real_time_arrival ? (
                      <View>
                        <Text className="text-lg font-bold text-blue-600 leading-tight">
                          {arrival.real_time_arrival}
                        </Text>
                        {arrival.real_time_arrival !== scheduledTime && (
                          <Text className="text-xs text-gray-400 leading-tight line-through">
                            {scheduledTime}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text className="text-lg font-bold text-gray-800">{scheduledTime}</Text>
                    )}
                  </View>
                  <View className="flex-1 ml-4 flex-row items-center">
                    {arrival.route_short_name && (
                      <View
                        className="rounded px-2 py-1 mr-2"
                        style={{
                          backgroundColor: arrival.route_color ? `#${arrival.route_color}` : '#2563EB',
                        }}
                      >
                        <Text
                          className="font-bold text-sm"
                          style={{
                            color: arrival.route_text_color ? `#${arrival.route_text_color}` : '#FFFFFF',
                          }}
                        >
                          {arrival.route_short_name}
                        </Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-base text-gray-700" numberOfLines={1}>
                        {arrival.trip_headsign || arrival.stop_headsign || 'Unknown Destination'}
                      </Text>
                      {hasVehicle && (
                        <View className="bg-green-500 rounded px-1 self-start mt-1">
                          <Text className="text-white text-[10px] font-bold px-1">LIVE</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );

              if (hasVehicle && onArrivalPress) {
                return <TouchableOpacity onPress={() => onArrivalPress(arrival)}>{Content}</TouchableOpacity>;
              }
              return Content;
            }}
            ListEmptyComponent={
              <Text className="text-gray-500 italic mt-4 text-center">
                No upcoming arrivals for this direction.
              </Text>
            }
            onScrollToIndexFailed={(info) => {
              const wait = new Promise((resolve) => setTimeout(resolve, 500));
              wait.then(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 });
              });
            }}
          />
        )}
      </View>
    </Animated.View>
  );
}
