import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { CameraView, CameraCapturedPicture, useCameraPermissions, CameraType } from 'expo-camera';

const SPHERE_SEGMENTS = 4; // 4x4 grid, resulting in 16 total segments
const UPDATE_INTERVAL = 100; // More frequent updates for testing

const App: React.FC = () => {
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [currentSphereBlock, setCurrentSphereBlock] = useState<string | null>(null);
  const [cameraType, setCameraType] = useState<CameraView['props']['type']>('back');
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
        console.log('Magnetometer data:', { x, y, z });
        const sphereBlock = calculateSphereBlock(x, y, z);
        console.log('Calculated sphere block:', sphereBlock);
        setCurrentSphereBlock(sphereBlock);
      });

      Magnetometer.setUpdateInterval(UPDATE_INTERVAL);
      console.log('Magnetometer started with update interval:', UPDATE_INTERVAL);

      // Check if Magnetometer is available
      const isMagnetometerAvailable = await Magnetometer.isAvailableAsync();
      console.log('Is Magnetometer available?', isMagnetometerAvailable);

      if (!isMagnetometerAvailable) {
        Alert.alert('Magnetometer not available', 'Your device does not have a magnetometer or it is not accessible.');
      }

      // Get initial location
      let initialLocation = await Location.getCurrentPositionAsync({});
      setLocation(initialLocation);
    })();

    return () => {
      Magnetometer.removeAllListeners();
    };
  }, [permission, requestPermission]);

  const calculateSphereBlock = (x: number, y: number, z: number): string => {
    // Calculate the azimuth angle (theta) in the x-y plane
    const theta = Math.atan2(y, x);
    
    // Calculate the elevation angle (phi)
    const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
    
    // Convert angles to degrees and normalize
    let azimuth = (theta * 180 / Math.PI + 360) % 360;
    let elevation = (phi * 180 / Math.PI + 90); // Elevation from -90 to 90 degrees
    
    // Calculate horizontal and vertical indices
    const horizontalIndex = Math.floor(azimuth / (360 / SPHERE_SEGMENTS));
    const verticalIndex = Math.floor(elevation / (180 / SPHERE_SEGMENTS));
    
    // Convert indices to letters and numbers
    const horizontalLabel = String.fromCharCode(65 + horizontalIndex); // A, B, C, D
    const verticalLabel = verticalIndex + 1; // 1, 2, 3, 4
    
    return `${horizontalLabel}${verticalLabel}`;
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
      <CameraView 
        style={styles.camera} 
        type={cameraType}
        ref={(ref: React.RefObject<CameraView>) => setCameraRef(ref)}
      >
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
        <Text>Horizontal: {currentSphereBlock ? currentSphereBlock[0] : 'N/A'} (A=Front, C=Back)</Text>
        <Text>Vertical: {currentSphereBlock ? currentSphereBlock[1] : 'N/A'} (1=Bottom, 4=Top)</Text>
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
