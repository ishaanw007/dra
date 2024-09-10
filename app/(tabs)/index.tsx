import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity, Animated, Easing } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer, Accelerometer, Gyroscope } from 'expo-sensors';
import { CameraView, CameraType, CameraCapturedPicture, useCameraPermissions } from 'expo-camera';
import { ArrowUp } from 'lucide-react';
import * as THREE from 'three';

const LOCATION_TOLERANCE = 0.0001; // Roughly 10 meters
const ORIENTATION_TOLERANCE = 0.1; // Tolerance for quaternion comparison
const SMOOTHING_WINDOW_SIZE = 20; // Number of readings to consider for smoothing
const UPDATE_INTERVAL = 200; // Update interval in milliseconds
const SPHERE_SEGMENTS = 16; // Number of segments to divide the sphere into

const App: React.FC = () => {
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [savedOrientation, setSavedOrientation] = useState<THREE.Quaternion | null>(null);
  const [savedSphereBlock, setSavedSphereBlock] = useState<number | null>(null);
  const [isLocationSet, setIsLocationSet] = useState<boolean>(false);
  const [currentOrientation, setCurrentOrientation] = useState<THREE.Quaternion>(new THREE.Quaternion());
  const [currentSphereBlock, setCurrentSphereBlock] = useState<number>(0);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  
  const orientationReadings = useRef<THREE.Quaternion[]>([]);
  const animatedRotation = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

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
      Gyroscope.setUpdateInterval(UPDATE_INTERVAL);

      const magnetSubscription = Magnetometer.addListener(magData => {
        const accSubscription = Accelerometer.addListener(accData => {
          const gyroSubscription = Gyroscope.addListener(gyroData => {
            calculateDeviceOrientation(magData, accData, gyroData);
            gyroSubscription.remove();
          });
          accSubscription.remove();
        });
      });

      return () => {
        magnetSubscription.remove();
      };
    })();
  }, [permission, requestPermission]);

  const calculateDeviceOrientation = (magData: any, accData: any, gyroData: any) => {
    const { x: mx, y: my, z: mz } = magData;
    const { x: ax, y: ay, z: az } = accData;
    const { x: gx, y: gy, z: gz } = gyroData;

    const rotationMatrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    // Calculate rotation matrix from accelerometer data
    const gravity = new THREE.Vector3(ax, ay, az).normalize();
    const xAxis = new THREE.Vector3(my * gravity.z - mz * gravity.y, mz * gravity.x - mx * gravity.z, mx * gravity.y - my * gravity.x).normalize();
    const yAxis = gravity.clone().cross(xAxis);

    rotationMatrix.makeBasis(xAxis, yAxis, gravity);
    quaternion.setFromRotationMatrix(rotationMatrix);

    // Apply gyroscope data
    const gyroQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(gx * UPDATE_INTERVAL / 1000, gy * UPDATE_INTERVAL / 1000, gz * UPDATE_INTERVAL / 1000));
    quaternion.multiply(gyroQuaternion);

    orientationReadings.current.push(quaternion);
    if (orientationReadings.current.length > SMOOTHING_WINDOW_SIZE) {
      orientationReadings.current.shift();
    }

    const smoothedQuaternion = new THREE.Quaternion();
    for (const q of orientationReadings.current) {
      smoothedQuaternion.multiply(q);
    }
    smoothedQuaternion.normalize();

    setCurrentOrientation(smoothedQuaternion);
    const sphereBlock = calculateSphereBlock(smoothedQuaternion);
    setCurrentSphereBlock(sphereBlock);
    
    const euler = new THREE.Euler().setFromQuaternion(smoothedQuaternion);
    Animated.timing(animatedRotation, {
      toValue: { x: euler.x, y: euler.y },
      duration: UPDATE_INTERVAL,
      easing: Easing.linear,
      useNativeDriver: true
    }).start();
  };

  const calculateSphereBlock = (quaternion: THREE.Quaternion): number => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    const spherical = new THREE.Spherical().setFromVector3(forward);
    const thetaIndex = Math.floor((spherical.theta / Math.PI) * SPHERE_SEGMENTS / 2);
    const phiIndex = Math.floor((spherical.phi / Math.PI) * SPHERE_SEGMENTS);
    return thetaIndex * SPHERE_SEGMENTS + phiIndex;
  };

  const setLocationAndOrientation = async () => {
    let location = await Location.getCurrentPositionAsync({});
    setLocation(location);
    setSavedOrientation(currentOrientation);
    setSavedSphereBlock(currentSphereBlock);
    setIsLocationSet(true);
    Alert.alert('Location and Orientation Set', `Latitude: ${location.coords.latitude.toFixed(6)}, Longitude: ${location.coords.longitude.toFixed(6)}, Sphere Block: ${currentSphereBlock}`);
  };

  const takePhoto = async () => {
    if (cameraRef && isLocationSet) {
      let currentLocation = await Location.getCurrentPositionAsync({});

      const isLocationMatched = 
        Math.abs(currentLocation.coords.latitude - location.coords.latitude) <= LOCATION_TOLERANCE &&
        Math.abs(currentLocation.coords.longitude - location.coords.longitude) <= LOCATION_TOLERANCE;

      const isOrientationMatched = 
        Math.abs(1 - currentOrientation.dot(savedOrientation!)) <= ORIENTATION_TOLERANCE &&
        currentSphereBlock === savedSphereBlock;

      if (isLocationMatched && isOrientationMatched) {
        let photo: CameraCapturedPicture = await cameraRef.takePictureAsync();
        Alert.alert('Photo Taken', `Photo saved to: ${photo.uri}`);
      } else {
        let mismatchReasons = [];
        if (!isLocationMatched) mismatchReasons.push('location');
        if (!isOrientationMatched) mismatchReasons.push('orientation');
        Alert.alert('Cannot Take Photo', `Mismatch in ${mismatchReasons.join(' and ')}. Please adjust and try again.`);
      }
    } else {
      Alert.alert('Location Not Set', 'Please set the location and orientation first.');
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
        <Animated.View style={[styles.orientationIndicator, {
          transform: [
            { rotateX: animatedRotation.x.interpolate({
                inputRange: [-Math.PI, Math.PI],
                outputRange: ['-180deg', '180deg']
              })
            },
            { rotateY: animatedRotation.y.interpolate({
                inputRange: [-Math.PI, Math.PI],
                outputRange: ['-180deg', '180deg']
              })
            }
          ]
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
        <Button title="Set Location and Orientation" onPress={setLocationAndOrientation} />
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      {isLocationSet && location && (
        <View>
          <Text>Saved Latitude: {location.coords.latitude.toFixed(6)}</Text>
          <Text>Saved Longitude: {location.coords.longitude.toFixed(6)}</Text>
          <Text>Saved Sphere Block: {savedSphereBlock}</Text>
        </View>
      )}
      <Text>Current Sphere Block: {currentSphereBlock}</Text>
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
  orientationIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
  },
});

export default App;
