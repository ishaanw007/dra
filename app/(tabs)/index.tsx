import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { CameraView, CameraType, CameraCapturedPicture, useCameraPermissions } from 'expo-camera';

const App: React.FC = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [savedDirection, setSavedDirection] = useState<number | null>(null);
  const [isLocationSet, setIsLocationSet] = useState<boolean>(false);
  const [magnetData, setMagnetData] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [currentDirection, setCurrentDirection] = useState<number>(0);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();

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

      Magnetometer.isAvailableAsync().then((result) => {
        if (result) {
          Magnetometer.addListener((magnetometerData) => {
            setMagnetData(magnetometerData);
            calculateDirection(magnetometerData);
          });
        }
      });
    })();
  }, [permission, requestPermission]);

  const calculateDirection = (magnetometerData: { x: number; y: number }) => {
    const { x: magX, y: magY } = magnetometerData;
    let heading = Math.atan2(magY, magX) * (180 / Math.PI);

    if (heading < 0) {
      heading += 360;
    }

    setCurrentDirection(heading);
  };

  const getCardinalDirection = (degree: number) => {
    if (degree >= 337.5 || degree < 22.5) return 'North';
    if (degree >= 22.5 && degree < 67.5) return 'Northeast';
    if (degree >= 67.5 && degree < 112.5) return 'East';
    if (degree >= 112.5 && degree < 157.5) return 'Southeast';
    if (degree >= 157.5 && degree < 202.5) return 'South';
    if (degree >= 202.5 && degree < 247.5) return 'Southwest';
    if (degree >= 247.5 && degree < 292.5) return 'West';
    if (degree >= 292.5 && degree < 337.5) return 'Northwest';
    return 'Unknown';
  };

  const setLocationAndDirection = async () => {
    let location = await Location.getCurrentPositionAsync({});
    setLocation(location);
    setSavedDirection(currentDirection);
    setIsLocationSet(true);
    Alert.alert('Location and Direction Set', `Latitude: ${location.coords.latitude}, Longitude: ${location.coords.longitude}, Direction: ${currentDirection.toFixed(2)}° ${getCardinalDirection(currentDirection)}`);
  };

  const takePhoto = async () => {
    if (cameraRef && isLocationSet) {
      let currentLocation = await Location.getCurrentPositionAsync({});
      let directionDifference = Math.abs(currentDirection - savedDirection!);

      // Allow a tolerance of ±5 degrees for the direction check
      if (
        currentLocation.coords.latitude === location?.coords.latitude &&
        currentLocation.coords.longitude === location?.coords.longitude &&
        directionDifference <= 2
      ) {
        let photo: CameraCapturedPicture = await cameraRef.takePictureAsync();
        Alert.alert('Photo Taken', `Photo saved to: ${photo.uri}`);
      } else {
        Alert.alert('Location or Direction Mismatch', 'You are not at the set location or facing the correct direction.');
      }
    } else {
      Alert.alert('Location Not Set', 'Please set the location and direction first.');
    }
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={(ref: any) => setCameraRef(ref)}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => setCameraType(cameraType === 'back' ? 'front' : 'back')}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
      <View style={styles.buttonContainer}>
        <Button title="Set Location and Direction" onPress={setLocationAndDirection} />
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      {isLocationSet && location && (
        <View>
          <Text>Saved Latitude: {location.coords.latitude.toFixed(6)}</Text>
          <Text>Saved Longitude: {location.coords.longitude.toFixed(6)}</Text>
          <Text>Saved Direction: {savedDirection!.toFixed(2)}° {getCardinalDirection(savedDirection!)}</Text>
        </View>
      )}
      <Text>Current Direction: {currentDirection.toFixed(2)}° {getCardinalDirection(currentDirection)}</Text>
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
});

export default App;
