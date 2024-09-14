import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import {
  accelerometer,
  magnetometer,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';
import { map } from 'rxjs/operators';
import { Camera, CameraView, CameraType, useCameraPermissions, CameraCapturedPicture } from 'expo-camera';

const UPDATE_INTERVAL = 100; // Update interval for sensors in milliseconds
const TOLERANCE = {
  azimuth: 5, // degrees
  pitch: 5,   // degrees
  roll: 5,    // degrees
  latitude: 0.0001,  // degrees (~11 meters)
  longitude: 0.0001, // degrees (~11 meters)
};

interface Orientation {
  azimuth: number;
  pitch: number;
  roll: number;
}

interface LocationData {
  latitude: number;
  longitude: number;
}

const App: React.FC = () => {
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  const [location, setLocation] = useState<LocationData | null>(null);
  const [orientation, setOrientation] = useState<Orientation | null>(null);

  const [storedLocation, setStoredLocation] = useState<LocationData | null>(null);
  const [storedOrientation, setStoredOrientation] = useState<Orientation | null>(null);

  const accelerometerData = useRef({ x: 0, y: 0, z: 0 });
  const magnetometerData = useRef({ x: 0, y: 0, z: 0 });
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    const requestPermissions = async () => {
      // Request Location Permission
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locationStatus === 'granted');

      if (locationStatus !== 'granted') {
        Alert.alert('Permission to access location was denied');
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    let accelerometerSubscription: any;
    let magnetometerSubscription: any;

    if (cameraPermission?.granted && hasLocationPermission) {
      // Set sensor update intervals
      setUpdateIntervalForType(SensorTypes.accelerometer, UPDATE_INTERVAL);
      setUpdateIntervalForType(SensorTypes.magnetometer, UPDATE_INTERVAL);

      // Subscribe to accelerometer data
      accelerometerSubscription = accelerometer
        .pipe(map(({ x, y, z }) => ({ x, y, z })))
        .subscribe(
          (data) => {
            accelerometerData.current = data;
            computeOrientation();
          },
          (error) => {
            console.log('Accelerometer error:', error);
          }
        );

      // Subscribe to magnetometer data
      magnetometerSubscription = magnetometer
        .pipe(map(({ x, y, z }) => ({ x, y, z })))
        .subscribe(
          (data) => {
            magnetometerData.current = data;
            computeOrientation();
          },
          (error) => {
            console.log('Magnetometer error:', error);
          }
        );
    }

    return () => {
      accelerometerSubscription && accelerometerSubscription.unsubscribe();
      magnetometerSubscription && magnetometerSubscription.unsubscribe();
    };
  }, [cameraPermission?.granted, hasLocationPermission]);

  const computeOrientation = () => {
    const { x: ax, y: ay, z: az } = accelerometerData.current;
    const { x: mx, y: my, z: mz } = magnetometerData.current;

    // Normalize accelerometer vector
    const normA = Math.sqrt(ax * ax + ay * ay + az * az);
    const axNorm = ax / normA;
    const ayNorm = ay / normA;
    const azNorm = az / normA;

    // Normalize magnetometer vector
    const normM = Math.sqrt(mx * mx + my * my + mz * mz);
    const mxNorm = mx / normM;
    const myNorm = my / normM;
    const mzNorm = mz / normM;

    // Calculate the horizontal component of the magnetic field vector
    const hx = myNorm * azNorm - mzNorm * ayNorm;
    const hy = mzNorm * axNorm - mxNorm * azNorm;
    const hz = mxNorm * ayNorm - myNorm * axNorm;

    // Normalize the horizontal component
    const normH = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const hxNorm = hx / normH;
    const hyNorm = hy / normH;
    const hzNorm = hz / normH;

    // Calculate the rotation matrix elements
    const m11 = hxNorm;
    const m12 = hyNorm;
    const m13 = hzNorm;
    const m21 = ayNorm * hzNorm - azNorm * hyNorm;
    const m22 = azNorm * hxNorm - axNorm * hzNorm;
    const m23 = axNorm * hyNorm - ayNorm * hxNorm;
    const m31 = axNorm;
    const m32 = ayNorm;
    const m33 = azNorm;

    const rotationMatrix = [m11, m12, m13, m21, m22, m23, m31, m32, m33];

    // Compute orientation angles
    const { azimuth, pitch, roll } = getOrientation(rotationMatrix);
    setOrientation({ azimuth, pitch, roll });
  };

  const getOrientation = (R: number[]): Orientation => {
    let azimuth = Math.atan2(R[1], R[4]);
    let pitch = Math.asin(-R[7]);
    let roll = Math.atan2(-R[6], R[8]);

    // Convert radians to degrees
    azimuth = ((azimuth * 180) / Math.PI + 360) % 360;
    pitch = (pitch * 180) / Math.PI;
    roll = (roll * 180) / Math.PI;

    return { azimuth, pitch, roll };
  };

  const getCurrentLocation = async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    } catch (error) {
      console.log('Location error:', error);
    }
  };

  const takePhoto = async () => {
    await getCurrentLocation();

    if (!cameraRef.current) {
      console.log('Camera ref is not available');
      return;
    }

    try {
      const photo: CameraCapturedPicture = await cameraRef.current.takePictureAsync();

      if (!storedOrientation || !storedLocation) {
        // Store current orientation and location
        setStoredOrientation(orientation);
        setStoredLocation(location);

        Alert.alert(
          'First Photo Taken',
          `Photo saved to: ${photo.uri}\nOrientation and location data stored for comparison.`
        );
      } else {
        // Compare current orientation and location with stored data
        const orientationMatch = compareOrientation(
          orientation!,
          storedOrientation
        );
        const locationMatch = compareLocation(location!, storedLocation);

        const matchMessage = `Orientation Match: ${
          orientationMatch ? '✅' : '❌'
        }\nLocation Match: ${locationMatch ? '✅' : '❌'}`;

        Alert.alert(
          'Second Photo Taken',
          `Photo saved to: ${photo.uri}\n\n${matchMessage}`
        );
      }
    } catch (error) {
      console.log('Camera error:', error);
    }
  };

  const compareOrientation = (
    current: Orientation,
    stored: Orientation
  ): boolean => {
    const azimuthDifference = angleDifference(
      current.azimuth,
      stored.azimuth
    );
    const pitchDifference = Math.abs(current.pitch - stored.pitch);
    const rollDifference = Math.abs(current.roll - stored.roll);

    return (
      azimuthDifference <= TOLERANCE.azimuth &&
      pitchDifference <= TOLERANCE.pitch &&
      rollDifference <= TOLERANCE.roll
    );
  };

  const compareLocation = (
    current: LocationData,
    stored: LocationData
  ): boolean => {
    const latitudeDifference = Math.abs(current.latitude - stored.latitude);
    const longitudeDifference = Math.abs(current.longitude - stored.longitude);

    return (
      latitudeDifference <= TOLERANCE.latitude &&
      longitudeDifference <= TOLERANCE.longitude
    );
  };

  const angleDifference = (angle1: number, angle2: number): number => {
    let difference = Math.abs(angle1 - angle2);
    if (difference > 180) {
      difference = 360 - difference;
    }
    return difference;
  };

  const toggleCameraFacing = () => {
    setFacing((current) =>
      current === 'back' ? 'front' : 'back'
    );
  };

  if (!cameraPermission || hasLocationPermission === null) {
    // Permissions are still loading
    return <View />;
  }

  if (!cameraPermission.granted || !hasLocationPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to access the camera and location
        </Text>
        {!cameraPermission.granted && (
          <Button
            onPress={requestCameraPermission}
            title="Grant Camera Permission"
          />
        )}
        {!hasLocationPermission && (
          <Button
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              setHasLocationPermission(status === 'granted');
            }}
            title="Grant Location Permission"
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={facing}
        ref={cameraRef}
      >
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
      <View style={styles.controlsContainer}>
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      <View style={styles.infoContainer}>
        <Text>
          Current Latitude: {location?.latitude?.toFixed(6) ?? 'N/A'}
        </Text>
        <Text>
          Current Longitude: {location?.longitude?.toFixed(6) ?? 'N/A'}
        </Text>
        <Text>
          Azimuth: {orientation?.azimuth?.toFixed(2) ?? 'Calculating...'}°
        </Text>
        <Text>
          Pitch: {orientation?.pitch?.toFixed(2) ?? 'Calculating...'}°
        </Text>
        <Text>
          Roll: {orientation?.roll?.toFixed(2) ?? 'Calculating...'}°
        </Text>
        {storedOrientation && storedLocation && (
          <>
            <Text style={{ marginTop: 10 }}>Stored Data:</Text>
            <Text>
              Stored Latitude: {storedLocation.latitude.toFixed(6)}
            </Text>
            <Text>
              Stored Longitude: {storedLocation.longitude.toFixed(6)}
            </Text>
            <Text>
              Stored Azimuth: {storedOrientation.azimuth.toFixed(2)}°
            </Text>
            <Text>
              Stored Pitch: {storedOrientation.pitch.toFixed(2)}°
            </Text>
            <Text>
              Stored Roll: {storedOrientation.roll.toFixed(2)}°
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  message: {
    textAlign: 'center',
    padding: 10,
    marginTop: 20,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  button: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  controlsContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  infoContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 18,
    color: '#fff',
  },
});

export default App;
