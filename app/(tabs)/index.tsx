import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { CameraView, CameraCapturedPicture, useCameraPermissions } from 'expo-camera';

const SPHERE_SEGMENTS = 16;
const UPDATE_INTERVAL = 100;

const App: React.FC = () => {
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [currentSphereBlock, setCurrentSphereBlock] = useState<number | null>(null);
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    (async () => {
      let { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      if (!permission?.granted) {
        await requestPermission();
      }

      Magnetometer.setUpdateInterval(UPDATE_INTERVAL);

      Magnetometer.addListener(data => {
        const { x, y, z } = data;
        const sphereBlock = calculateSphereBlock(x, y, z);
        setCurrentSphereBlock(sphereBlock);
      });

      // Get initial location
      let initialLocation = await Location.getCurrentPositionAsync({});
      setLocation(initialLocation);
    })();

    return () => {
      Magnetometer.removeAllListeners();
    };
  }, [permission, requestPermission]);

  const calculateSphereBlock = (x: number, y: number, z: number): number => {
    // Calculate the azimuth angle (theta) in the x-y plane
    const theta = Math.atan2(y, x);
    
    // Convert theta from radians to degrees and normalize to 0-360 range
    let degrees = (theta * 180 / Math.PI + 360) % 360;
    
    // Divide the 360 degrees into SPHERE_SEGMENTS equal parts
    // and return the index of the current segment (0 to SPHERE_SEGMENTS-1)
    return Math.floor(degrees / (360 / SPHERE_SEGMENTS));
  };

  const setLocationAndOrientation = async () => {
    let newLocation = await Location.getCurrentPositionAsync({});
    setLocation(newLocation);
    Alert.alert('Location and Orientation Set', `Latitude: ${newLocation.coords.latitude.toFixed(6)}, Longitude: ${newLocation.coords.longitude.toFixed(6)}, Sphere Block: ${currentSphereBlock}`);
  };

  const takePhoto = async () => {
    if (cameraRef) {
      let photo: CameraCapturedPicture = await cameraRef.takePictureAsync();
      Alert.alert('Photo Taken', `Photo saved to: ${photo.uri}`);
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
      <CameraView style={styles.camera} type={cameraType as any} ref={(ref: any) => setCameraRef(ref)}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => setCameraType(cameraType === 'back' ? 'front' : 'back')}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
      <View style={styles.controlsContainer}>
        <Button title="Set Location and Orientation" onPress={setLocationAndOrientation} />
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      <View style={styles.infoContainer}>
        <Text>Current Latitude: {location?.coords.latitude.toFixed(6) ?? 'N/A'}</Text>
        <Text>Current Longitude: {location?.coords.longitude.toFixed(6) ?? 'N/A'}</Text>
        <Text>Current Sphere Block: {currentSphereBlock ?? 'Calculating...'}</Text>
      </View>
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
  infoContainer: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});

export default App;
