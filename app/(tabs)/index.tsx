import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity, Animated, Easing } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer, Accelerometer } from 'expo-sensors';
import { CameraView, CameraType, CameraCapturedPicture, useCameraPermissions } from 'expo-camera';
import { ArrowUp } from 'lucide-react';

const LOCATION_TOLERANCE = 0.0001; // Roughly 10 meters
const DIRECTION_TOLERANCE = 15; // 15 degrees
const SMOOTHING_WINDOW_SIZE = 20; // Number of readings to consider for smoothing
const UPDATE_INTERVAL = 200; // Update interval in milliseconds

const App: React.FC = () => {
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [savedDirection, setSavedDirection] = useState<number | null>(null);
  const [isLocationSet, setIsLocationSet] = useState<boolean>(false);
  const [currentDirection, setCurrentDirection] = useState<number>(0);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  
  const directionReadings = useRef<number[]>([]);
  const animatedDirection = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      if (!permission) {
        return;
      }

      if (!permission.granted) {
        await requestPermission();
      }

      Magnetometer.setUpdateInterval(UPDATE_INTERVAL);
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL);

      const magnetSubscription = Magnetometer.addListener(magData => {
        const accData = Accelerometer.addListener(accData => {
          calculateTiltCompensatedDirection(magData, accData);
          accData.remove();
        });
      });

      return () => {
        magnetSubscription.remove();
      };
    })();
  }, [permission, requestPermission]);

  const calculateTiltCompensatedDirection = (magData: any, accData: any) => {
    const { x: mx, y: my, z: mz } = magData;
    const { x: ax, y: ay, z: az } = accData;

    const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    const roll = Math.atan2(ay, az);

    const xh = mx * Math.cos(pitch) + mz * Math.sin(pitch);
    const yh = mx * Math.sin(roll) * Math.sin(pitch) + my * Math.cos(roll) - mz * Math.sin(roll) * Math.cos(pitch);

    let heading = Math.atan2(yh, xh) * (180 / Math.PI);
    if (heading < 0) heading += 360;

    directionReadings.current.push(heading);
    if (directionReadings.current.length > SMOOTHING_WINDOW_SIZE) {
      directionReadings.current.shift();
    }

    const smoothedDirection = directionReadings.current.reduce((a, b) => a + b) / directionReadings.current.length;
    const roundedDirection = Math.round(smoothedDirection);

    setCurrentDirection(roundedDirection);
    
    Animated.timing(animatedDirection, {
      toValue: roundedDirection,
      duration: UPDATE_INTERVAL,
      easing: Easing.linear,
      useNativeDriver: true
    }).start();
  };

  const getCardinalDirection = (degree: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degree / 45) % 8];
  };

  const setLocationAndDirection = async () => {
    let location = await Location.getCurrentPositionAsync({});
    setLocation(location);
    setSavedDirection(currentDirection);
    setIsLocationSet(true);
    Alert.alert('Location and Direction Set', `Latitude: ${location.coords.latitude.toFixed(6)}, Longitude: ${location.coords.longitude.toFixed(6)}, Direction: ${currentDirection}° ${getCardinalDirection(currentDirection)}`);
  };

  const takePhoto = async () => {
    if (cameraRef && isLocationSet) {
      let currentLocation = await Location.getCurrentPositionAsync({});
      let directionDifference = Math.abs(currentDirection - savedDirection!);

      const isLocationMatched = 
        Math.abs(currentLocation.coords.latitude - location.coords.latitude) <= LOCATION_TOLERANCE &&
        Math.abs(currentLocation.coords.longitude - location.coords.longitude) <= LOCATION_TOLERANCE;

      const isDirectionMatched = directionDifference <= DIRECTION_TOLERANCE;

      if (isLocationMatched && isDirectionMatched) {
        let photo: CameraCapturedPicture = await cameraRef.takePictureAsync();
        Alert.alert('Photo Taken', `Photo saved to: ${photo.uri}`);
      } else {
        let mismatchReasons = [];
        if (!isLocationMatched) mismatchReasons.push('location');
        if (!isDirectionMatched) mismatchReasons.push('direction');
        Alert.alert('Cannot Take Photo', `Mismatch in ${mismatchReasons.join(' and ')}. Please adjust and try again.`);
      }
    } else {
      Alert.alert('Location Not Set', 'Please set the location and direction first.');
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="Grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={(ref: any) => setCameraRef(ref)}>
        <Animated.View style={[styles.compassContainer, {
          transform: [{
            rotate: animatedDirection.interpolate({
              inputRange: [0, 360],
              outputRange: ['0deg', '360deg']
            })
          }]
        }]}>
          <ArrowUp size={48} color="red" />
        </Animated.View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => setCameraType(cameraType === 'back' ? 'front' : 'back')}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
      <View style={styles.controlsContainer}>
        <Button title="Set Location and Direction" onPress={setLocationAndDirection} />
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      {isLocationSet && location && (
        <View>
          <Text>Saved Latitude: {location.coords.latitude.toFixed(6)}</Text>
          <Text>Saved Longitude: {location.coords.longitude.toFixed(6)}</Text>
          <Text>Saved Direction: {savedDirection}° {getCardinalDirection(savedDirection!)}</Text>
        </View>
      )}
      <Text>Current Direction: {currentDirection}° {getCardinalDirection(currentDirection)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  controlsContainer: {
    padding: 20,
  },
  compassContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
  },
});

export default App;